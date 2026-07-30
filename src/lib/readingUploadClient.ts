import { upload } from "@vercel/blob/client"
import { registerUploadedReading } from "@/actions/sources"
import { MAX_READING_BYTES, MAX_READING_LABEL, READING_UPLOAD_PREFIX, formatBytes } from "./readingUpload"

/**
 * Uploads one reading from the browser straight to Blob storage, then asks the
 * server to record it.
 *
 * Shared by both upload surfaces (the admin Readings form and the Library tab)
 * so they cannot drift apart on limits or error wording — the previous split
 * meant fixing the size ceiling in one place left the other still broken.
 *
 * The bytes never travel through a Server Action, which is the point: a
 * serverless request body is capped at 4.5MB on Vercel and most course
 * readings are larger.
 */
export type UploadPhase = "sending" | "reading"

export class ReadingTooLargeError extends Error {
  constructor(size: number) {
    super(`${formatBytes(size)} — over the ${MAX_READING_LABEL} limit. Split the chapter, or reduce the scan resolution.`)
    this.name = "ReadingTooLargeError"
  }
}

export async function uploadReading(
  file: File,
  options: {
    title?: string
    courseId?: string | null
    onPhase?: (phase: UploadPhase) => void
    onProgress?: (percent: number) => void
  } = {}
) {
  // Checked here as well as in the token route and again on the stored blob.
  // Failing before the bytes move is faster and explains itself; the
  // server-side checks are what actually enforce it.
  if (file.size > MAX_READING_BYTES) throw new ReadingTooLargeError(file.size)

  options.onPhase?.("sending")
  const blob = await upload(`${READING_UPLOAD_PREFIX}/${file.name}`, file, {
    access: "private",
    handleUploadUrl: "/api/readings/upload",
    contentType: "application/pdf",
    onUploadProgress: ({ percentage }) => options.onProgress?.(Math.round(percentage)),
  })

  // Bytes are stored; this is the extract-text-and-score half.
  options.onPhase?.("reading")
  return registerUploadedReading({
    storageKey: blob.pathname,
    filename: file.name,
    title: options.title,
    courseId: options.courseId ?? null,
  })
}
