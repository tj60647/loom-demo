/**
 * SWEEP THE SUITE'S OWN DEBRIS OFF THE TEST ACCOUNT.
 *
 * Specs that write create concepts, passages and readings, and tear them down
 * at the end. A spec that FAILS never reaches its teardown, so the rows stay —
 * and they accumulate run after run until they change what the next run sees.
 *
 * That is not hypothetical. On 2026-08-19 three orphaned `addcard seed …`
 * passages from earlier failed runs had gathered on page 2 of Object Worlds,
 * and `add-concept-card.spec.ts` began failing an assertion that had nothing to
 * do with the change under test: `railScale` shrinks a crowded rail, so opening
 * the editor rescaled the card and moved it 56px, against a 12px tolerance. The
 * spec was right, the code was right, and the fixture was wrong.
 *
 * WHAT IT WILL AND WILL NOT TOUCH.
 *
 * Only rows owned by the suite's own account (test-user-a@loom.local — see
 * playwright/global-setup.ts and /api/auth/test-login), and within that account
 * only labels matching the shapes the specs generate. Both conditions, always.
 * A real person's loom is never in scope because the account is not theirs, and
 * the account's own seeded fixtures survive because their names do not match.
 *
 * The patterns are anchored and end in the six-digit stamp the specs mint from
 * `Date.now()`, except where a spec uses a fixed name of its own. Each is listed
 * with the spec that produces it, so a renamed spec shows up here as a pattern
 * with no owner rather than as a silent leak.
 *
 * DRY RUN BY DEFAULT. It prints what it would remove and exits. `--apply`
 * removes. The Playwright teardown passes --apply; a human running
 * `npm run clean:fixtures` gets the report first, which is the right default
 * for anything that deletes.
 */

import { db } from "../src/db"
import { concepts, passages, passageConcepts, sources, edges } from "../src/db/schema"
import { and, eq, inArray, or, like, sql } from "drizzle-orm"
import { gatherSourceBlobKeys } from "../src/lib/sourceBlobs"
import { readingStorage } from "../src/lib/storage"

const APPLY = process.argv.includes("--apply")
const TEST_EMAIL = "test-user-a@loom.local"

/**
 * Every label shape the writing specs coin, and who coins it. SQL LIKE, so `_`
 * is a single character — the six-digit stamp is written `______` rather than
 * `%` so a pattern cannot widen to swallow a real concept that merely starts
 * with the same words.
 */
const CONCEPT_PATTERNS: { like: string; from: string }[] = [
  { like: "addcard seed ______", from: "add-concept-card.spec.ts" },
  { like: "addcard filed ______", from: "add-concept-card.spec.ts" },
  { like: "Rail Test Concept A", from: "concept-rail.spec.ts" },
  { like: "Test Concept for %", from: "pdf-viewer.spec.ts" },
  // reuse-seam mints two stems, not the "seam concept" this list once claimed
  // (that pattern never matched anything the spec coins).
  { like: "single reading concept ______", from: "reuse-seam.spec.ts" },
  { like: "crossing concept ______", from: "reuse-seam.spec.ts" },
  { like: "practice concept", from: "sandbox.spec.ts (should never reach the real db)" },
]

const SOURCE_PATTERNS: { like: string; from: string }[] = [
  { like: "A book carded by the journey suite ______", from: "journey-learner.spec.ts" },
]

/**
 * Passages the specs type verbatim. A passage sitting on a debris reading is
 * only removable when its CONTENT is recognised too — the reading being
 * debris is not enough on its own. Recognise, never assume: an unrecognised
 * passage on a debris reading means the reading pattern has caught something
 * it should not have, and the run stops.
 */
const PASSAGE_PATTERNS: { like: string; from: string }[] = [
  { like: "A passage typed by the journey suite%", from: "journey-learner.spec.ts" },
]

async function main() {
  const label = process.env.DATABASE_URL?.includes("localhost") ? "local" : "remote"
  console.log(`[clean-fixtures] ${APPLY ? "APPLY" : "dry run"} against the ${label} database`)

  const users = await db.execute(sql`SELECT id FROM "user" WHERE email = ${TEST_EMAIL} LIMIT 1`)
  const userId = (users.rows[0] as { id?: string } | undefined)?.id
  if (!userId) {
    // Not an error: a fresh database has no test account until global-setup
    // runs, and a teardown must not fail a green suite.
    console.log(`[clean-fixtures] no ${TEST_EMAIL} in this database — nothing to sweep`)
    return
  }

  // --- concepts, and the passages that exist only to carry them -------------
  const conceptRows = await db
    .select({ id: concepts.id, label: concepts.label })
    .from(concepts)
    .where(and(eq(concepts.userId, userId), or(...CONCEPT_PATTERNS.map((p) => like(concepts.label, p.like)))))

  const sourceRows = await db
    .select({ id: sources.id, title: sources.title, storageKey: sources.storageKey })
    .from(sources)
    .where(and(eq(sources.createdByUserId, userId), or(...SOURCE_PATTERNS.map((p) => like(sources.title, p.like)))))

  /**
   * A passage is debris when every concept on it is debris, or when it has no
   * concepts at all AND sits on a reading that is itself debris. A passage
   * filed under one debris concept and one real one is NOT debris — it is a
   * real capture that a spec happened to touch, and dropping it would take the
   * student's words with it.
   */
  const debrisConceptIds = conceptRows.map((c) => c.id)
  const filings = debrisConceptIds.length
    ? await db
        .select({ passageId: passageConcepts.passageId, conceptId: passageConcepts.conceptId })
        .from(passageConcepts)
        .where(inArray(passageConcepts.conceptId, debrisConceptIds))
    : []
  const touched = [...new Set(filings.map((f) => f.passageId))]
  const allFilings = touched.length
    ? await db
        .select({ passageId: passageConcepts.passageId, conceptId: passageConcepts.conceptId })
        .from(passageConcepts)
        .where(inArray(passageConcepts.passageId, touched))
    : []
  const byPassage = new Map<string, string[]>()
  for (const f of allFilings) byPassage.set(f.passageId, [...(byPassage.get(f.passageId) ?? []), f.conceptId])
  const debrisPassageIds = touched.filter((p) =>
    (byPassage.get(p) ?? []).every((c) => debrisConceptIds.includes(c))
  )
  const spared = touched.length - debrisPassageIds.length

  console.log(`[clean-fixtures] concepts  ${conceptRows.length}`)
  for (const c of conceptRows) console.log(`                 · ${c.label}`)
  console.log(`[clean-fixtures] passages  ${debrisPassageIds.length}` +
    (spared ? `  (${spared} spared — also filed under a concept that is not debris)` : ""))
  /**
   * What is riding on a debris reading, before anything drops it. A reading the
   * journey suite carded should carry nothing — it exists for one assertion and
   * is torn down — so a non-zero count here means the pattern has caught
   * something it should not, and the run must stop rather than take a
   * student's passages with the fixture.
   */
  let carried = { passages: 0, files: 0 }
  if (sourceRows.length) {
    const ids = sourceRows.map((s) => s.id)
    const r = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM passage p WHERE p."sourceId" IN ${ids}) AS passages,
        (SELECT count(*) FROM source s WHERE s.id IN ${ids} AND s."storageKey" IS NOT NULL) AS files
    `)
    const row = r.rows[0] as { passages: string; files: string }
    carried = { passages: Number(row.passages), files: Number(row.files) }
  }
  console.log(`[clean-fixtures] readings  ${sourceRows.length}` +
    (sourceRows.length ? `  (carrying ${carried.passages} passages, ${carried.files} with a stored file)` : ""))
  for (const s of sourceRows.slice(0, 5)) console.log(`                 · ${s.title}`)
  if (sourceRows.length > 5) console.log(`                 · … and ${sourceRows.length - 5} more`)
  /**
   * Split what rides on the debris readings into recognised and not. Only the
   * recognised go; ONE unrecognised passage stops the whole run, because at
   * that point the reading pattern is catching something nobody described and
   * the safe move is to stop rather than to guess which rows are precious.
   */
  let ridersToDrop: string[] = []
  if (sourceRows.length && carried.passages > 0) {
    const ids = sourceRows.map((s) => s.id)
    const riders = await db.execute(sql`
      SELECT p.id, p.content FROM passage p WHERE p."sourceId" IN ${ids}
    `)
    const rows = riders.rows as { id: string; content: string }[]
    const known = (c: string) =>
      PASSAGE_PATTERNS.some((pp) => {
        const stem = pp.like.replace(/%/g, "")
        return (c ?? "").startsWith(stem)
      })
    const strangers = rows.filter((r) => !known(r.content))
    ridersToDrop = rows.filter((r) => known(r.content)).map((r) => r.id)
    console.log(`[clean-fixtures] riders    ${ridersToDrop.length} recognised, ${strangers.length} not`)
    if (strangers.length) {
      console.error("[clean-fixtures] REFUSING — unrecognised passages ride on readings this would drop:")
      for (const x of strangers.slice(0, 5)) console.error(`                 · "${(x.content ?? "").slice(0, 80)}"`)
      console.error(
        "                 A reading being debris does not make a passage on it debris. " +
        "Add a pattern for these if they are the suite's, or find out whose they are."
      )
      process.exit(1)
    }
  }

  if (!APPLY) {
    console.log("[clean-fixtures] dry run — pass --apply to remove")
    return
  }
  if (!conceptRows.length && !debrisPassageIds.length && !sourceRows.length && !ridersToDrop.length) {
    console.log("[clean-fixtures] nothing to remove")
    return
  }

  // Order matters: joins before the rows they point at.
  if (debrisPassageIds.length) {
    await db.delete(passageConcepts).where(inArray(passageConcepts.passageId, debrisPassageIds))
    await db.delete(passages).where(inArray(passages.id, debrisPassageIds))
  }
  if (debrisConceptIds.length) {
    await db.delete(passageConcepts).where(inArray(passageConcepts.conceptId, debrisConceptIds))
    await db.delete(edges).where(
      or(inArray(edges.fromId, debrisConceptIds), inArray(edges.toId, debrisConceptIds))
    )
    await db.delete(concepts).where(inArray(concepts.id, debrisConceptIds))
  }
  if (ridersToDrop.length) {
    await db.delete(passageConcepts).where(inArray(passageConcepts.passageId, ridersToDrop))
    await db.delete(passages).where(inArray(passages.id, ridersToDrop))
  }
  if (sourceRows.length) {
    // The store's side of the teardown, gathered BEFORE the rows go — the
    // same sweep deleteSource runs, from the same module, because a second
    // copy of the key-family list is how one caller falls behind the next
    // blob family (src/lib/sourceBlobs.ts). Until 2026-08-20 this deleted
    // the rows and left every blob a fixture upload had minted.
    const keySets = await Promise.all(
      sourceRows.map((s) => gatherSourceBlobKeys(s.id, s.storageKey))
    )
    await db.delete(sources).where(inArray(sources.id, sourceRows.map((s) => s.id)))
    const keys = [...new Set(keySets.flatMap((set) => [...set]))]
    const results = await Promise.allSettled(keys.map((key) => readingStorage.delete(key)))
    const failedKeys = keys.filter((_, i) => results[i].status === "rejected")
    for (const key of failedKeys) console.error(`[clean-fixtures] blob not removed: ${key}`)
    console.log(
      `[clean-fixtures] blobs     ${keys.length - failedKeys.length} of ${keys.length} removed` +
        (failedKeys.length ? ` — ${failedKeys.length} FAILED, keys logged above` : "")
    )
  }
  console.log("[clean-fixtures] removed")
}

// No process.exit on the happy path: exiting while the driver still holds a
// handle trips a libuv assertion on Windows, which is noise in every suite run
// (the teardown calls this). Letting it return closes cleanly.
main()
  .catch((e) => {
    console.error("[clean-fixtures]", e)
    process.exit(1)
  })
