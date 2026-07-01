import { promises as fs } from "fs"
import path from "path"

/**
 * Pluggable storage backend for uploaded reading files (PDFs).
 *
 * Files are intentionally NOT served from /public: anything under /public is
 * served statically by Next.js with no auth check, which meant any reading
 * in the library could be downloaded by an unauthenticated request. Instead,
 * files are kept behind this abstraction and only ever reachable through the
 * authenticated `/api/readings/[sourceId]` route (see
 * src/app/api/readings/[sourceId]/route.ts).
 *
 * The default implementation stores files on local disk, which is fine for
 * this demo/single-instance deployment. For a real multi-instance production
 * deployment (e.g. Vercel), swap this for an object-storage backed
 * implementation (e.g. Vercel Blob) — the interface below is intentionally
 * small so that's a drop-in change; see `createVercelBlobStorage` below for
 * a starting point once `@vercel/blob` is installed and configured.
 */
export interface ReadingStorage {
  /** Persist a file's bytes under a unique key and return that key. */
  put(key: string, data: Buffer): Promise<void>
  /** Retrieve a previously stored file's bytes. */
  get(key: string): Promise<Buffer>
}

const STORAGE_ROOT = path.join(process.cwd(), "storage", "readings")

class LocalFileStorage implements ReadingStorage {
  private async ensureRoot() {
    await fs.mkdir(STORAGE_ROOT, { recursive: true })
  }

  private resolveSafe(key: string) {
    // Guard against path traversal: only allow simple file-name-like keys.
    const normalized = path.normalize(key).replace(/^([./\\])+/, "")
    const resolved = path.join(STORAGE_ROOT, normalized)
    if (!resolved.startsWith(STORAGE_ROOT)) {
      throw new Error("Invalid storage key")
    }
    return resolved
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.ensureRoot()
    const dest = this.resolveSafe(key)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, data)
  }

  async get(key: string): Promise<Buffer> {
    const dest = this.resolveSafe(key)
    return fs.readFile(dest)
  }
}

// NOTE: on serverless platforms with a read-only/ephemeral filesystem, `put`
// will not persist across deploys/instances. If deploying somewhere other
// than a single long-lived server, install `@vercel/blob` (or another object
// store client), implement `ReadingStorage` against it, and swap it in below.
export const readingStorage: ReadingStorage = new LocalFileStorage()
