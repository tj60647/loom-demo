import { put, get, del } from "@vercel/blob"

/**
 * Storage backend for shared, immutable reading assets: uploaded PDFs and the
 * generated cover images for them.
 *
 * These files are the same for every reader (100 users share one PDF), so they
 * live in durable object storage (Vercel Blob) — NOT on the local filesystem,
 * which is ephemeral/per-instance on serverless platforms like Vercel. All
 * per-user data (highlights, concepts, loom state) lives in Postgres, not here.
 *
 * The Blob store is a *private* store: blobs are not reachable by public URL and
 * every read goes through an authenticated Vercel Function via the SDK's
 * `get()`. Reads are proxied through the authenticated
 * `/api/readings/[sourceId]` route, which streams the bytes after checking the
 * session, so access to readings stays gated behind auth.
 *
 * Auth/credentials are resolved automatically by the SDK: on Vercel it uses the
 * OIDC token + `BLOB_STORE_ID`; elsewhere (local dev, scripts) it falls back to
 * `BLOB_READ_WRITE_TOKEN`. Run `vercel env pull` (or set the token in
 * `.env.local`) to develop locally.
 */
export interface ReadingStorage {
  /** Persist a file's bytes under a unique key. */
  put(key: string, data: Buffer): Promise<void>
  /** Retrieve a previously stored file's bytes. */
  get(key: string): Promise<Buffer>
  /** Remove a previously stored file if it exists. */
  delete(key: string): Promise<void>
}

// The store's access mode is fixed at creation time and must match what we pass
// to every SDK call. We use a private store so reading files are never exposed
// by a public URL — they are only ever delivered through our authenticated route.
const BLOB_ACCESS = "private" as const

class VercelBlobStorage implements ReadingStorage {
  async put(key: string, data: Buffer): Promise<void> {
    await put(key, data, {
      access: BLOB_ACCESS,
      // Use our key verbatim as the pathname so reads/deletes are addressable
      // by key, and allow re-uploads (e.g. regenerated covers) to overwrite.
      addRandomSuffix: false,
      allowOverwrite: true,
    })
  }

  async get(key: string): Promise<Buffer> {
    const result = await get(key, { access: BLOB_ACCESS })
    if (!result || result.statusCode !== 200) {
      throw new Error(`Blob not found for key: ${key}`)
    }
    const arrayBuffer = await new Response(result.stream).arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async delete(key: string): Promise<void> {
    // `del` accepts a pathname and is a no-op if the blob doesn't exist.
    await del(key)
  }
}

export const readingStorage: ReadingStorage = new VercelBlobStorage()
