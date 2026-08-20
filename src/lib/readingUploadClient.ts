import { upload } from "@vercel/blob/client"
import { registerOwnUploadedReading, registerUploadedReading } from "@/actions/sources"
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

type UploadCallbacks = {
  onPhase?: (phase: UploadPhase) => void
  onProgress?: (percent: number) => void
}

/** The browser → Blob half, identical for every surface: cap check, token,
    bytes across. What the resulting blob is REGISTERED as differs. */
async function sendToBlob(file: File, callbacks: UploadCallbacks) {
  // Checked here as well as in the token route and again on the stored blob.
  // Failing before the passages move is faster and explains itself; the
  // server-side checks are what actually enforce it.
  if (file.size > MAX_READING_BYTES) throw new ReadingTooLargeError(file.size)

  callbacks.onPhase?.("sending")
  const blob = await upload(`${READING_UPLOAD_PREFIX}/${file.name}`, file, {
    access: "private",
    handleUploadUrl: "/api/readings/upload",
    contentType: "application/pdf",
    onUploadProgress: ({ percentage }) => callbacks.onProgress?.(Math.round(percentage)),
  })

  // Bytes are stored; the register half extracts text and scores.
  callbacks.onPhase?.("reading")
  return blob
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
  const blob = await sendToBlob(file, options)
  return registerUploadedReading({
    storageKey: blob.pathname,
    filename: file.name,
    title: options.title,
    courseId: options.courseId ?? null,
  })
}

/** A reading of the student's own, PDF and all — lands on their shelf only. */
export async function uploadOwnReading(
  file: File,
  options: {
    title?: string
    author?: string
    sourceReference?: string
    onPhase?: (phase: UploadPhase) => void
    onProgress?: (percent: number) => void
  } = {}
) {
  const blob = await sendToBlob(file, options)
  return registerOwnUploadedReading({
    storageKey: blob.pathname,
    filename: file.name,
    title: options.title,
    author: options.author,
    sourceReference: options.sourceReference,
  })
}
