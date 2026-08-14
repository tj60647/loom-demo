/**
 * Reprocess the shared library: find every page whose text is gibberish or
 * missing, put it through the five-reader transcription panel, accept what the
 * panel unanimously agrees on, write repaired revisions, and rescore.
 *
 * The acts are the pipeline's own — detectRepairsForSource, transcribe,
 * acceptRepairDecision, applyAcceptedRepairs, rescoreSource — so every guard
 * that protects the admin panel protects this run: overlap on accept,
 * staleness, kept-text, measured improvement and highlight re-anchoring on
 * apply. Nothing here has its own copy of a rule.
 *
 * ACCEPTANCE POLICY, deliberately conservative (TJ's own plan, §6): a repair
 * is accepted automatically only when the panel had at least three complete
 * readers and NOT ONE disagreement — the agreed text is then every reader's
 * text. Anything less stays `proposed` for a person in the repair panel, and
 * this script's report names each one and why it was held.
 *
 * Detection proposes at most 12 pages per source per run, so the script
 * cycles detect → transcribe → accept → apply until a pass proposes nothing
 * new. Transcription costs real money (~$0.20/page across five readers);
 * --max-usd is a hard stop measured from what OpenRouter actually reported.
 *
 * Usage:
 *   npx tsx scripts/reprocess-library.ts --survey            # detect + report; spends nothing
 *   npx tsx scripts/reprocess-library.ts --run               # the full program, every shared reading
 *   npx tsx scripts/reprocess-library.ts --run <sourceId>…   # named readings only
 *   npx tsx scripts/reprocess-library.ts --backfill          # source_revision rows for pre-0025 repairs
 *   npx tsx scripts/reprocess-library.ts --rescore           # rescore every shared reading (covers too)
 *   npx tsx scripts/reprocess-library.ts --run --max-usd 60  # raise the spend ceiling (default 40)
 *
 * Requires DATABASE_URL, blob credentials and OPENROUTER_API_KEY (.env.local).
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm"
import { db, databaseLabel } from "../src/db"
import { sourceRepairs, sourceRevisions, sources, users } from "../src/db/schema"
import { isAdminUser } from "../src/lib/auth"
import { readingStorage } from "../src/lib/storage"
import { detectRepairsForSource, transcribeRepairRegion } from "../src/lib/repairPipeline"
import { acceptRepairDecision, applyAcceptedRepairs } from "../src/lib/repairApply"
import { rescoreSource } from "../src/lib/readingScore"

const args = process.argv.slice(2)
const survey = args.includes("--survey")
const run = args.includes("--run")
const backfillOnly = args.includes("--backfill")
const rescoreOnly = args.includes("--rescore")
const maxUsdIndex = args.indexOf("--max-usd")
const MAX_USD = maxUsdIndex !== -1 ? Number(args[maxUsdIndex + 1]) || 40 : 40
const ids = args.filter((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--max-usd")

/** Cycles per source: each proposes ≤12 pages, so 5 covers a 60-page scan. */
const MAX_CYCLES = 5

/** A panel this small settles nothing automatically. */
const MIN_COMPLETE_READERS = 3

/** When a reader did not report a price, budget as if it cost a whole region. */
const UNPRICED_REGION_USD = 0.35

let spentUsd = 0

type Held = { title: string; pageNumber: number; why: string }
const held: Held[] = []
const applied: { title: string; pages: number[]; revisedKey: string }[] = []

async function actingAdminId() {
  // The batch acts in the site admin's name; every acceptance carries a note
  // saying the panel was unanimous and the accept was this batch, so the
  // record distinguishes a person's judgement from a policy's. Admin-ness is
  // decided by isAdminUser — the same test the app applies — because the row's
  // role alone misses the email-fallback admins, which is how the real site
  // admin is actually configured.
  const rows = await db
    .select({ id: users.id, role: users.role, email: users.email })
    .from(users)
    .orderBy(asc(users.id))
  const admin = rows.find((row) => isAdminUser(row))
  if (!admin) throw new Error("No admin user to act as.")
  return admin.id
}

async function backfillRevisions() {
  // Readings repaired before source_revision existed: their current key is a
  // '-repaired-' one and the applied repairs remember what it superseded.
  const repairedSources = await db
    .select({ id: sources.id, title: sources.title, storageKey: sources.storageKey })
    .from(sources)
    .where(isNotNull(sources.storageKey))
  let created = 0
  for (const source of repairedSources) {
    if (!source.storageKey?.includes("-repaired-")) continue
    const existing = await db
      .select({ id: sourceRevisions.id })
      .from(sourceRevisions)
      .where(eq(sourceRevisions.sourceId, source.id))
    if (existing.length > 0) continue
    const appliedRepairs = await db
      .select({ measuredAgainstKey: sourceRepairs.measuredAgainstKey, appliedAt: sourceRepairs.appliedAt })
      .from(sourceRepairs)
      .where(and(eq(sourceRepairs.sourceId, source.id), eq(sourceRepairs.status, "applied")))
    const predecessorKey = appliedRepairs[0]?.measuredAgainstKey ?? null
    await db.insert(sourceRevisions).values({
      sourceId: source.id,
      storageKey: source.storageKey,
      predecessorKey,
      reason: "backfill: repaired before source_revision existed (migration 0025)",
      createdAt: appliedRepairs[0]?.appliedAt ?? new Date(),
    })
    console.log(`  lineage ${source.title} — ${predecessorKey ?? "?"} → ${source.storageKey}`)
    created += 1
  }
  console.log(`[reprocess] backfilled ${created} revision row${created === 1 ? "" : "s"}`)
}

/** Unanimous panel, big enough to mean something, with text to accept. */
function strongConsensus(repair: typeof sourceRepairs.$inferSelect): { ok: true } | { ok: false; why: string } {
  const votes = repair.votes
  if (!votes) return { ok: false, why: "no consensus recorded — transcription failed or never ran" }
  if (votes.readers < MIN_COMPLETE_READERS) {
    return { ok: false, why: `only ${votes.readers} complete reader${votes.readers === 1 ? "" : "s"}` }
  }
  if (repair.disagreements.length > 0) {
    return { ok: false, why: `${repair.disagreements.length} disagreement${repair.disagreements.length === 1 ? "" : "s"} for a person to settle` }
  }
  if (!repair.agreedText.trim()) return { ok: false, why: "the panel agreed on nothing" }
  return { ok: true }
}

async function processSource(
  source: { id: string; title: string; storageKey: string },
  adminId: string
) {
  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    const buffer = await readingStorage.get(source.storageKey)
    const detection = await detectRepairsForSource(source.id, buffer, source.storageKey)
    if (detection.unlocatable.length > 0) {
      console.log(`         pages damaged but not repairable here (lost spaces): ${detection.unlocatable.join(", ")}`)
    }
    if (detection.blank.length > 0) {
      console.log(`         pages whose crop rendered empty (investigate): ${detection.blank.join(", ")}`)
    }
    if (detection.regions === 0) {
      if (cycle === 1) console.log(`  clean  ${source.title}`)
      return
    }
    console.log(`  cycle ${cycle}  ${source.title} — ${detection.regions} page${detection.regions === 1 ? "" : "s"} proposed`)
    if (survey) return

    const proposals = await db
      .select()
      .from(sourceRepairs)
      .where(and(eq(sourceRepairs.sourceId, source.id), eq(sourceRepairs.status, "proposed")))
      .orderBy(asc(sourceRepairs.pageNumber))

    for (const proposal of proposals) {
      if (spentUsd >= MAX_USD) {
        console.log(`  STOP   spend ceiling reached ($${spentUsd.toFixed(2)} of $${MAX_USD}) — run again to continue`)
        return "budget"
      }
      // A proposal that already carries a consensus was read on an earlier
      // run; reading it again would pay the panel twice for the same page.
      if (!proposal.votes) {
        try {
          const result = await transcribeRepairRegion(proposal.id)
          spentUsd += result.costUsd ?? UNPRICED_REGION_USD
          console.log(
            `         p${proposal.pageNumber}: ${result.readers}/${result.panel} readers, ` +
              `${result.disagreements.length} disagreement${result.disagreements.length === 1 ? "" : "s"}, ` +
              `$${(result.costUsd ?? 0).toFixed(2)} (total $${spentUsd.toFixed(2)})`
          )
        } catch (error) {
          const why = error instanceof Error ? error.message.split("\n")[0] : String(error)
          console.log(`         p${proposal.pageNumber}: transcription failed — ${why}`)
          held.push({ title: source.title, pageNumber: proposal.pageNumber, why: `transcription failed: ${why}` })
          continue
        }
      }
    }

    // Fresh rows: transcription wrote consensus onto them.
    const readBack = await db
      .select()
      .from(sourceRepairs)
      .where(and(eq(sourceRepairs.sourceId, source.id), eq(sourceRepairs.status, "proposed")))
      .orderBy(asc(sourceRepairs.pageNumber))

    let acceptedCount = 0
    for (const repair of readBack) {
      const verdict = strongConsensus(repair)
      if (!verdict.ok) {
        console.log(`         p${repair.pageNumber}: held for review — ${verdict.why}`)
        held.push({ title: source.title, pageNumber: repair.pageNumber, why: verdict.why })
        continue
      }
      try {
        await acceptRepairDecision(
          repair.id,
          repair.agreedText,
          "Batch accept (reprocess-library, TJ 2026-08-13): unanimous five-reader panel, no disagreements.",
          adminId
        )
        acceptedCount += 1
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error)
        console.log(`         p${repair.pageNumber}: accept refused — ${why}`)
        held.push({ title: source.title, pageNumber: repair.pageNumber, why: `accept refused: ${why}` })
      }
    }

    if (acceptedCount === 0) {
      console.log(`         nothing accepted this cycle; leaving the rest for the panel`)
      return
    }

    try {
      const result = await applyAcceptedRepairs(source.id)
      console.log(
        `  wrote  ${source.title} — pages ${result.pagesReplaced.join(", ")} → ${result.revisedKey}` +
          (result.highlightsMoved ? ` (${result.highlightsMoved} highlights re-anchored)` : "")
      )
      applied.push({ title: source.title, pages: result.pagesReplaced, revisedKey: result.revisedKey })
      // The rotation moved the key; the next cycle must measure the new file.
      const fresh = await db
        .select({ storageKey: sources.storageKey })
        .from(sources)
        .where(eq(sources.id, source.id))
        .limit(1)
      source.storageKey = fresh[0]?.storageKey ?? source.storageKey
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      console.log(`  HELD   ${source.title} — apply refused: ${why}`)
      held.push({ title: source.title, pageNumber: 0, why: `apply refused: ${why}` })
      return
    }
  }
  console.log(`         cycle cap reached — run again to continue this reading`)
}

async function main() {
  console.log(`[reprocess] database: ${databaseLabel()}`)
  console.log(`[reprocess] mode: ${survey ? "survey" : backfillOnly ? "backfill" : rescoreOnly ? "rescore" : run ? `run (ceiling $${MAX_USD})` : "?"}`)

  if (!survey && !run && !backfillOnly && !rescoreOnly) {
    console.error("[reprocess] pass --survey, --run, --backfill or --rescore")
    process.exit(1)
  }

  await backfillRevisions()
  if (backfillOnly) return

  const shared = await db
    .select({ id: sources.id, title: sources.title, storageKey: sources.storageKey })
    .from(sources)
    .where(
      ids.length > 0
        ? inArray(sources.id, ids)
        : and(isNotNull(sources.storageKey), eq(sources.isOwn, false), eq(sources.isArchived, false))
    )
    .orderBy(asc(sources.createdAt))

  console.log(`[reprocess] ${shared.length} reading${shared.length === 1 ? "" : "s"}`)

  if (!rescoreOnly) {
    // Resolved once, and only when a decision could actually be recorded — a
    // survey writes no acceptance and must not fail on an empty user table.
    const adminId = survey ? "" : await actingAdminId()
    for (const source of shared) {
      if (!source.storageKey) continue
      try {
        const outcome = await processSource(source as { id: string; title: string; storageKey: string }, adminId)
        if (outcome === "budget") break
      } catch (error) {
        console.error(`  FAIL   ${source.title} — ${error instanceof Error ? error.message : error}`)
        held.push({ title: source.title, pageNumber: 0, why: `run failed: ${error instanceof Error ? error.message : error}` })
      }
    }
  }

  if (!survey) {
    console.log(`[reprocess] rescoring ${shared.length} readings (covers re-rendered on the way)`)
    for (const source of shared) {
      try {
        await rescoreSource(source.id)
        console.log(`  scored ${source.title}`)
      } catch (error) {
        console.error(`  FAIL   score ${source.title} — ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  console.log(`\n[reprocess] spend: $${spentUsd.toFixed(2)} (readers' own reports)`)
  if (applied.length > 0) {
    console.log(`[reprocess] revisions written:`)
    for (const entry of applied) console.log(`  · ${entry.title} — pages ${entry.pages.join(", ")}`)
  }
  if (held.length > 0) {
    console.log(`[reprocess] held for a person (${held.length}):`)
    for (const entry of held) {
      console.log(`  · ${entry.title}${entry.pageNumber ? ` p${entry.pageNumber}` : ""} — ${entry.why}`)
    }
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("[reprocess] failed:", error instanceof Error ? error.message : error)
    process.exit(1)
  }
)
