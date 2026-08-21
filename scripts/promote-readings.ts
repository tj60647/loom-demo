/**
 * Promote library readings from one environment's database to another's —
 * dev → production, in practice (TJ, 2026-08-21: "the production database
 * should have all the readings that the current dev database does").
 *
 * What moves: the LIBRARY — source rows (never isOwn, never isArchived),
 * their page text, score, revision history, and course_source scheduling for
 * courses the target also has. What never moves: student work. Concepts,
 * passages, edges, cloths, maps and events belong to people, and the
 * environments' data stays permanently apart (docs/data-environments.md) —
 * this script is the one sanctioned exception, for curriculum, and it is
 * ADDITIVE ONLY: a reading whose seedKey, id, or title the target already
 * has is skipped whole. Nothing here updates and nothing here deletes.
 *
 * Blobs: the store is shared (deployments.md invariant 4), but since the
 * 2026-08-16 namespacing an upload from dev or local lives physically in
 * that environment's drawer (env/dev/…, env/local/…) while the row stores
 * the logical key — and production reads BARE keys only. So each promoted
 * reading's blobs are materialized at their bare key first: read through
 * the drawers, copy to bare. Bare writes collide with nothing — every key
 * carries a fresh UUID, and the reading is new to the target by definition.
 * A missing FILE (storageKey or a revision) aborts that reading; a missing
 * derived asset (cover, sheet, page image, crop) is only noted — the target
 * regenerates those on demand.
 *
 *   npx tsx scripts/promote-readings.ts --to .env.production.pulled          # dry run
 *   npx tsx scripts/promote-readings.ts --to .env.production.pulled --apply
 */
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"
import { copy, head } from "@vercel/blob"
import { gatherSourceBlobKeys } from "../src/lib/sourceBlobs"

const APPLY = process.argv.includes("--apply")
const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const FROM_FILE = argOf("--from") ?? ".env.local"
const TO_FILE = argOf("--to")
// A reading named here stays behind even if the target lacks it — for the
// copy that is not ready to promote (first use: the full-transcription
// "Learning How to Learn by Novak & Gowin", TJ 2026-08-21: "yet to be fully
// processed and is thus, useless").
const SKIPS = process.argv
  .flatMap((arg, i) => (arg === "--skip" ? [process.argv[i + 1]] : []))
  .filter(Boolean)
  .map((s) => s.toLowerCase())
if (!TO_FILE) throw new Error("--to <env file> is required (e.g. --to .env.production.pulled)")

function envValue(file: string, key: string): string {
  const text = readFileSync(file, "utf8")
  const match = text.match(new RegExp(`^${key}="?([^"\\r\\n]+)"?`, "m"))
  if (!match) throw new Error(`no ${key} in ${file}`)
  return match[1]
}
const maskHost = (url: string) => url.replace(/\/\/[^@]*@/, "//***@")

const fromUrl = envValue(FROM_FILE, "DATABASE_URL")
const toUrl = envValue(TO_FILE, "DATABASE_URL")
const blobToken = envValue(FROM_FILE, "BLOB_READ_WRITE_TOKEN")

// The drawers a source-side upload may physically live in, tried in order
// after the bare key. Matches blobNamespace() for local dev and the dev
// alias — the two places readings get added from.
const DRAWERS = ["env/local/", "env/dev/"]

const from = neon(fromUrl)
const to = neon(toUrl)

const normTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ")

async function columnsOf(sql: ReturnType<typeof neon>, table: string): Promise<string[]> {
  const rows = await sql.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
    [table]
  )
  return (rows as { column_name: string }[]).map((r) => r.column_name)
}

/** Insert rows into the target using only the columns BOTH sides have. */
async function insertRows(table: string, rows: Record<string, unknown>[], shared: string[]) {
  for (const row of rows) {
    const cols = shared.filter((c) => row[c] !== undefined)
    const params = cols.map((c) => {
      const v = row[c]
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v
    })
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ")
    const quoted = cols.map((c) => `"${c}"`).join(", ")
    await to.query(`insert into "${table}" (${quoted}) values (${placeholders})`, params)
  }
}

/** Make sure a blob is readable at its bare key; copy from a drawer if not. */
async function materialize(key: string): Promise<"bare" | "copied" | "missing"> {
  const exists = async (path: string) => {
    try {
      await head(path, { token: blobToken })
      return true
    } catch {
      return false
    }
  }
  if (await exists(key)) return "bare"
  for (const drawer of DRAWERS) {
    if (await exists(drawer + key)) {
      if (APPLY) await copy(drawer + key, key, { access: "public", token: blobToken })
      return "copied"
    }
  }
  return "missing"
}

async function main() {
  console.log(`[promote-readings] ${APPLY ? "APPLY" : "dry run"}`)
  console.log(`  from: ${maskHost(fromUrl)}`)
  console.log(`  to:   ${maskHost(toUrl)}`)

  const [library, targetSources, targetCourses] = await Promise.all([
    from.query(`select * from "source" where "isOwn" = false and "isArchived" = false order by title`),
    to.query(`select id, "seedKey", title from "source"`),
    to.query(`select id from "course"`),
  ])
  const targetIds = new Set((targetSources as { id: string }[]).map((r) => r.id))
  const targetSeedKeys = new Set((targetSources as { seedKey: string | null }[]).map((r) => r.seedKey).filter(Boolean))
  const targetTitles = new Set((targetSources as { title: string }[]).map((r) => normTitle(r.title)))
  const targetCourseIds = new Set((targetCourses as { id: string }[]).map((r) => r.id))

  const missing = (library as Record<string, unknown>[]).filter((s) => {
    if (targetIds.has(s.id as string)) return false
    if (s.seedKey && targetSeedKeys.has(s.seedKey as string)) return false
    if (SKIPS.some((skip) => (s.title as string).toLowerCase().includes(skip))) {
      console.log(`  -- skipped by --skip: ${s.title}`)
      return false
    }
    return !targetTitles.has(normTitle(s.title as string))
  })

  console.log(`[promote-readings] library ${library.length} on the source; missing on the target: ${missing.length}`)
  for (const s of missing) console.log(`  · ${s.title}`)
  if (missing.length === 0) return

  const shared = {
    source: await columnsOf(to, "source").then(async (t) => (await columnsOf(from, "source")).filter((c) => t.includes(c))),
    source_page: await columnsOf(to, "source_page").then(async (t) => (await columnsOf(from, "source_page")).filter((c) => t.includes(c))),
    source_score: await columnsOf(to, "source_score").then(async (t) => (await columnsOf(from, "source_score")).filter((c) => t.includes(c))),
    source_revision: await columnsOf(to, "source_revision").then(async (t) => (await columnsOf(from, "source_revision")).filter((c) => t.includes(c))),
    course_source: await columnsOf(to, "course_source").then(async (t) => (await columnsOf(from, "course_source")).filter((c) => t.includes(c))),
  }

  for (const s of missing) {
    const id = s.id as string
    const storageKey = (s.storageKey as string | null) ?? null

    // Every key the reading owns, from the same recipe deleteSource and
    // clean-fixtures share — files must materialize, derivatives may.
    const keys = await gatherSourceBlobKeys(id, storageKey)
    const revisionRows = await from.query(`select * from "source_revision" where "sourceId" = $1`, [id])
    const fileKeys = new Set<string>()
    if (storageKey) fileKeys.add(storageKey)
    for (const r of revisionRows as { storageKey: string; predecessorKey: string | null }[]) {
      fileKeys.add(r.storageKey)
      if (r.predecessorKey) fileKeys.add(r.predecessorKey)
    }

    let fileMissing = false
    let copied = 0
    for (const key of keys) {
      const state = await materialize(key)
      if (state === "copied") copied++
      if (state === "missing" && fileKeys.has(key)) {
        console.log(`  !! ${s.title}: FILE ${key} is in no drawer — skipping this reading`)
        fileMissing = true
        break
      }
    }
    if (fileMissing) continue

    if (!APPLY) {
      console.log(`  ok ${s.title} — would copy ${copied} blob(s) to bare keys and insert its rows`)
      continue
    }

    const [pages, score, courseLinks] = await Promise.all([
      from.query(`select * from "source_page" where "sourceId" = $1`, [id]),
      from.query(`select * from "source_score" where "sourceId" = $1`, [id]),
      from.query(`select * from "course_source" where "sourceId" = $1`, [id]),
    ])
    await insertRows("source", [s], shared.source)
    await insertRows("source_page", pages as Record<string, unknown>[], shared.source_page)
    await insertRows("source_score", score as Record<string, unknown>[], shared.source_score)
    await insertRows("source_revision", revisionRows as Record<string, unknown>[], shared.source_revision)
    const portableLinks = (courseLinks as Record<string, unknown>[]).filter((l) => targetCourseIds.has(l.courseId as string))
    await insertRows("course_source", portableLinks, shared.course_source)
    console.log(
      `  ++ ${s.title}: ${copied} blob(s) materialized, ${pages.length} pages, ` +
      `${revisionRows.length} revisions, ${portableLinks.length}/${courseLinks.length} course links`
    )
  }

  console.log(APPLY ? "[promote-readings] done" : "[promote-readings] dry run — pass --apply to promote")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
