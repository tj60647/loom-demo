import { promises as fs } from "fs"
import path from "path"
import * as dotenv from "dotenv"
import { put, list } from "@vercel/blob"

// Load local env the same way the app's db module does, and strip any
// surrounding quotes so the Blob SDK receives clean credential values.
dotenv.config({ path: ".env.local" })
function unquote(value?: string) {
  if (!value) return value
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}
for (const key of ["BLOB_STORE_ID", "VERCEL_OIDC_TOKEN", "BLOB_READ_WRITE_TOKEN"]) {
  if (process.env[key]) process.env[key] = unquote(process.env[key])
}

/**
 * One-time migration: upload the reading assets that currently live on local
 * disk (storage/readings/**) into Vercel Blob, preserving each file's key so
 * the app finds them unchanged. Safe to re-run — it skips files already
 * present in Blob. Requires Blob credentials (BLOB_READ_WRITE_TOKEN, or
 * BLOB_STORE_ID + VERCEL_OIDC_TOKEN) in the environment.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "readings")

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(full)))
    } else if (entry.isFile() && entry.name !== ".gitkeep") {
      files.push(full)
    }
  }
  return files
}

async function main() {
  const hasReadWriteToken = !!process.env.BLOB_READ_WRITE_TOKEN
  const hasOidc = !!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN
  if (!hasReadWriteToken && !hasOidc) {
    throw new Error(
      "No Blob credentials found. Set BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID + VERCEL_OIDC_TOKEN (run `vercel env pull`), in .env.local first."
    )
  }

  const files = await walk(STORAGE_ROOT)
  if (files.length === 0) {
    console.log("No local files to migrate.")
    return
  }

  const { blobs } = await list({ limit: 1000 })
  const existing = new Set(blobs.map((b) => b.pathname))

  for (const file of files) {
    // Key is the path relative to the storage root, using forward slashes.
    const key = path.relative(STORAGE_ROOT, file).split(path.sep).join("/")
    if (existing.has(key)) {
      console.log(`skip (already in blob): ${key}`)
      continue
    }
    const data = await fs.readFile(file)
    const contentType = key.endsWith(".pdf")
      ? "application/pdf"
      : key.endsWith(".png")
      ? "image/png"
      : "application/octet-stream"
    await put(key, data, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    })
    console.log(`uploaded: ${key} (${data.length} bytes)`)
  }

  console.log("Migration complete.")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
