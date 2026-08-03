import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { MAX_READING_BYTES, READING_UPLOAD_PREFIX } from "@/lib/readingUpload"

/**
 * Mints short-lived tokens so the browser can upload a reading straight to Blob
 * storage, instead of pushing the bytes through a Server Action.
 *
 * Why this route exists: a serverless function's request body is hard-capped at
 * 4.5MB on Vercel, which no config raises, and course readings are scanned book
 * chapters that routinely exceed it. Going browser → Blob bypasses the function
 * body entirely; the server only ever receives the resulting blob's pathname.
 *
 * This route hands out write credentials, so it is the security surface of the
 * upload path. Three things hold it closed:
 *
 *   1. A signed-in session required before any token is generated — and
 *      sign-in itself is allowlist-gated, so "signed in" means enrolled or
 *      admin. An unauthenticated caller gets a 401 and no token — never a
 *      token with a narrower scope. Admins upload for the shared library;
 *      learners for readings of their own (registerOwnUploadedReading binds
 *      those to isOwn and never to a course — what a token holder may RECORD
 *      is decided there, not here).
 *   2. The token is scoped by the SDK to one pathname, PDFs only, and
 *      MAX_READING_BYTES. The browser cannot widen any of these; the caps are
 *      applied here, server-side, not taken from the client's request.
 *   3. Uploads are forced under READING_UPLOAD_PREFIX so a client cannot name a
 *      path that collides with cover images or any other stored key.
 *
 * Blobs are written `private`, matching the store (see src/lib/storage.ts):
 * readings stay unreachable by public URL and are still served only through the
 * authenticated /api/readings/[sourceId] route.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        // Re-check inside the callback rather than trusting the check above to
        // still hold: this is the only place the token is actually issued.
        const current = await getServerSession(authOptions)
        if (!current?.user?.id) {
          throw new Error("Unauthorized")
        }
        if (!pathname.startsWith(`${READING_UPLOAD_PREFIX}/`)) {
          throw new Error("Uploads must be stored under the readings prefix.")
        }
        return {
          access: "private" as const,
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_READING_BYTES,
          // A random suffix keeps two uploads of the same filename from
          // overwriting one another; the real pathname comes back to the client
          // and is what gets recorded as the source's storageKey.
          addRandomSuffix: true,
        }
      },
      // Deliberately omitted: onUploadCompleted is a webhook Vercel calls, and
      // it cannot reach localhost, so relying on it would make the flow work in
      // production and silently not in development. The client calls
      // registerUploadedReading itself once the upload resolves.
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload could not be authorized" },
      { status: 400 }
    )
  }
}
