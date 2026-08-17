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
 *
 * One store, but not one namespace: see `blobNamespace` below for why every
 * environment except production writes into a drawer of its own, and why that
 * is the only thing standing between a cover re-rendered on the dev alias and
 * the cover a student is looking at.
 */
export interface ReadingStorage {
  /** Persist a file's bytes under a unique key. */
  put(key: string, data: Buffer): Promise<void>
  /** Retrieve a previously stored file's bytes. */
  get(key: string): Promise<Buffer>
  /**
   * The same bytes, left as a stream. Use this when the file is being passed
   * straight through to a response: a Vercel Function may only return 4.5MB in
   * a buffered body, and three course readings are larger than that, so
   * buffering them is the difference between a reading opening and a 404. A
   * streamed body is not subject to that cap. Buffer only when the bytes are
   * actually needed in memory (cover rendering, text extraction).
   */
  getStream(key: string): Promise<ReadableStream<Uint8Array>>
  /** Remove a previously stored file if it exists. */
  delete(key: string): Promise<void>
}

// The store's access mode is fixed at creation time and must match what we pass
// to every SDK call. We use a private store so reading files are never exposed
// by a public URL — they are only ever delivered through our authenticated route.
const BLOB_ACCESS = "private" as const

/**
 * Which environment's drawer this process writes into.
 *
 * One blob store serves every environment (deployments.md invariant 4: the
 * `source.storageKey` values in each branched database all name objects in the
 * same store, so a second store would 404 every reading). But a database branch
 * copies `source.id` verbatim, and the derived-asset keys are pure functions of
 * it — `covers/<id>.png`, `pages/<id>/<n>.w<width>.webp`. Two environments
 * therefore compute byte-identical keys, and `put` allows overwrite, so a cover
 * regenerated on the dev alias lands on top of production's.
 *
 * The fix is the one Neon already applies to rows, applied here to objects:
 * **read through to the shared originals, write only into your own space.**
 * Production writes bare keys, which is what makes this change require no
 * migration — every object that exists today stays exactly where it is, and
 * every environment can still read it.
 *
 * `LOOM_BLOB_NAMESPACE` overrides the derivation, for CI and for anyone who
 * needs two local checkouts not to share a drawer.
 */
export function blobNamespace(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.LOOM_BLOB_NAMESPACE?.trim()
  if (explicit) return `env/${slugForKey(explicit)}/`

  // Positive test, never `!== "production"`: an unset VERCEL_ENV must not be
  // able to grant a process the right to write production's objects.
  if (env.VERCEL_ENV === "production") return ""

  if (env.VERCEL_ENV === "preview") {
    // Per branch, so two previews cannot overwrite each other either. The ref
    // is absent on a redeploy of a detached commit; the shared preview drawer
    // is the safe answer there, since the alternative is production's.
    const ref = env.VERCEL_GIT_COMMIT_REF?.trim()
    return ref ? `env/preview-${slugForKey(ref)}/` : "env/preview/"
  }

  // Local dev, scripts, CI — anything not running on Vercel.
  return "env/local/"
}

/**
 * Key-safe form of a branch name. Blob pathnames take `/` as a separator, so a
 * ref like `fix/blob-namespace` would otherwise open a directory per slash.
 *
 * Dots are legal inside a name (`release.2`) but never at either end, because
 * the segment that survives must not be able to BE a traversal: a namespace of
 * `..` would otherwise yield the pathname `env/../`, and a store that
 * normalizes that has just been handed production's root. Truncation happens
 * before the ends are trimmed, so a cut that lands mid-dot cannot reintroduce
 * one.
 */
function slugForKey(value: string): string {
  const slug = value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 64)
    .replace(/^[-.]+|[-.]+$/g, "")
  return slug || "unnamed"
}

class VercelBlobStorage implements ReadingStorage {
  private readonly prefix = blobNamespace()

  async put(key: string, data: Buffer): Promise<void> {
    await put(this.prefix + key, data, {
      access: BLOB_ACCESS,
      // Use our key verbatim as the pathname so reads/deletes are addressable
      // by key, and allow re-uploads (e.g. regenerated covers) to overwrite.
      addRandomSuffix: false,
      allowOverwrite: true,
    })
  }

  async get(key: string): Promise<Buffer> {
    const arrayBuffer = await new Response(await this.getStream(key)).arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async getStream(key: string): Promise<ReadableStream<Uint8Array>> {
    if (!this.prefix) return this.streamExact(key)
    // Read through: this environment's own copy if it has made one, otherwise
    // the shared original. A failure here is treated as a miss — worst case a
    // transient error serves the shared version, which is the same thing every
    // environment saw before this drawer existed.
    try {
      return await this.streamExact(this.prefix + key)
    } catch {
      return this.streamExact(key)
    }
  }

  private async streamExact(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const result = await get(pathname, { access: BLOB_ACCESS })
    if (!result || result.statusCode !== 200) {
      throw new Error(`Blob not found for key: ${pathname}`)
    }
    return result.stream as ReadableStream<Uint8Array>
  }

  async delete(key: string): Promise<void> {
    // Only ever this environment's own copy. Outside production that makes
    // deletion free: `deleteSource` on the dev alias removes the drawer's copy
    // if there is one and no-ops if there is not, and the reading students are
    // reading is never touched. `del` is a no-op for a pathname that does not
    // exist, so the miss costs nothing and needs no branch here.
    await del(this.prefix + key)
  }
}

export const readingStorage: ReadingStorage = new VercelBlobStorage()
