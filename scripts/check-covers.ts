/**
 * Audit — and with --fix, backfill — the cover thumbnails in blob storage.
 *
 * Covers live at a deterministic key (`covers/<sourceId>.png`, see
 * src/lib/pdfCover.ts) in the ONE blob store every environment shares, so a
 * backfill run from anywhere heals local, dev, ci and production at once.
 * Without a cached cover the route re-renders from the full PDF on demand —
 * fine once, pathological when it happens per page view (see the cover route).
 *
 * Usage:
 *   npx tsx scripts/check-covers.ts          # report only
 *   npx tsx scripts/check-covers.ts --fix    # render + persist missing covers
 *
 * Requires DATABASE_URL and blob credentials (.env.local).
 */
import { db } from "../src/db"
import { sources } from "../src/db/schema"
import { readingStorage } from "../src/lib/storage"
import { getSourceCoverKey, renderPdfCoverImage } from "../src/lib/pdfCover"
import { isNotNull } from "drizzle-orm"

const MIN_COVER_BYTES = 2048 // same bar as the cover route
const fix = process.argv.includes("--fix")

async function main() {
  const rows = await db
    .select({ id: sources.id, title: sources.title, storageKey: sources.storageKey })
    .from(sources)
    .where(isNotNull(sources.storageKey))

  let ok = 0
  const missing: { id: string; title: string; storageKey: string; reason: string }[] = []
  for (const r of rows) {
    try {
      const b = await readingStorage.get(getSourceCoverKey(r.id))
      if (b.length >= MIN_COVER_BYTES) ok++
      else missing.push({ ...r, storageKey: r.storageKey!, reason: `cached but too small (${b.length}b)` })
    } catch {
      missing.push({ ...r, storageKey: r.storageKey!, reason: "no cover in store" })
    }
  }
  console.log(`[check-covers] cached and usable: ${ok} / ${rows.length}`)
  for (const m of missing) console.log(`[check-covers]   ${m.reason}: ${m.title}`)

  if (!fix || missing.length === 0) return

  for (const m of missing) {
    try {
      const pdf = await readingStorage.get(m.storageKey)
      const cover = await renderPdfCoverImage(pdf)
      await readingStorage.put(getSourceCoverKey(m.id), cover)
      console.log(`[check-covers] rendered + stored: ${m.title}`)
    } catch (e) {
      console.warn(`[check-covers] could not render (route will serve its SVG fallback): ${m.title} — ${e instanceof Error ? e.message : e}`)
    }
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("[check-covers] failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  },
)
