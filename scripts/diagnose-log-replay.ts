/**
 * Why doesn't the replay end where the cloth stands?
 *
 * TJ, 2026-08-12: "why does the timeline not look like the cloth at the end?
 * i am surprised it does not. what am i missing?"
 *
 * A fair question with a checkable answer. The cloth at the top of 03 is the
 * LIVE graph, scoped to the reading. The log's replay is a RECONSTRUCTION: it
 * folds the recorded acts and can only rebuild what the record contains. So
 * any gap between the two is one of exactly three things, and this script says
 * which, by name:
 *
 *   1. a row whose creating act was never recorded (it predates the log, or
 *      its path never called recordEvent),
 *   2. a row whose act exists but is not PLACED in this reading by
 *      `eventsForReading` (unstamped, and no evidence to place it by),
 *   3. a row the fold does not know how to rebuild (an event kind
 *      `foldEvents` ignores).
 *
 * Read-only. Usage:
 *   npx tsx scripts/diagnose-log-replay.ts <email> "<reading title fragment>"
 */
import { eq, asc } from "drizzle-orm"
import { db } from "../src/db"
import {
  users, concepts, passages, passageConcepts, edges, sources, graphEvents,
} from "../src/db/schema"
import { eventsForReading } from "../src/lib/logScope"
import type { GraphEvent, LoomState } from "../src/lib/types"

async function main() {
  const email = process.argv[2] ?? "tj60647@gmail.com"
  const titleWant = (process.argv[3] ?? "Learning How to Learn").toLowerCase()

  const user = (await db.select().from(users).where(eq(users.email, email)))[0]
  if (!user) throw new Error(`no user for ${email}`)

  const allSources = await db.select().from(sources)
  const source = allSources.find((s) => (s.title ?? "").toLowerCase().includes(titleWant))
  if (!source) throw new Error(`no reading matching "${titleWant}"`)

  console.log(`user    ${user.name} <${user.email}>`)
  console.log(`reading ${source.title}\n`)

  // --- the live graph, as the page sees it -----------------------------------
  const myConcepts = await db.select().from(concepts).where(eq(concepts.userId, user.id))
  const myPassages = await db.select().from(passages).where(eq(passages.userId, user.id))
  const myEdges = await db.select().from(edges).where(eq(edges.userId, user.id))
  const links = await db.select().from(passageConcepts)

  const conceptIdsOf = (passageId: string) =>
    links.filter((l) => l.passageId === passageId).map((l) => l.conceptId)

  const state = {
    concepts: myConcepts.map((c) => ({ ...c, def: c.def ?? "", note: c.note ?? "" })),
    passages: myPassages.map((b) => ({ ...b, conceptIds: conceptIdsOf(b.id) })),
    edges: myEdges,
    links: [], maps: [], cloths: [],
    views: { cardTable: { positions: {}, bends: {} } },
  } as unknown as LoomState

  // Scoped exactly as `scopedGraph` does: a concept is in scope when a passage
  // from this reading evidences it, or when it has no passages anywhere.
  const here = state.passages.filter((b) => b.sourceId === source.id)
  const evidenced = new Set(here.flatMap((b) => b.conceptIds))
  const hasPassage = new Set(state.passages.flatMap((b) => b.conceptIds))
  const inScope = (id: string) => evidenced.has(id) || !hasPassage.has(id)
  const liveConcepts = state.concepts.filter((c) => inScope(c.id))
  const liveEdges = state.edges.filter((e) => inScope(e.fromId) && inScope(e.toId))

  // --- the record, and what it can rebuild -----------------------------------
  const rows = await db.select().from(graphEvents)
    .where(eq(graphEvents.userId, user.id)).orderBy(asc(graphEvents.at))
  const mine = eventsForReading(rows as unknown as GraphEvent[], source.id, state)

  const kinds = new Map<string, number>()
  mine.forEach((e) => kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1))

  // Which live rows have a recorded, placed creating act?
  const created = new Set(mine.filter((e) => e.entityType === "concept" && e.kind === "concept.create").map((e) => e.entityId))
  const capturedIds = new Set(
    mine.filter((e) => e.entityType === "passage" && (e.kind === "passage.capture" || e.kind === "passage.create")).map((e) => e.entityId)
  )
  const thrown = new Set(mine.filter((e) => e.entityType === "edge" && e.kind === "edge.throw").map((e) => e.entityId))

  // Same acts, before the reading filter — to tell "never recorded" from
  // "recorded but not placed here".
  const anyCreate = new Set(rows.filter((r) => r.kind === "concept.create").map((r) => r.entityId))
  const anyCapture = new Set(rows.filter((r) => r.kind === "passage.capture" || r.kind === "passage.create").map((r) => r.entityId))
  const anyThrow = new Set(rows.filter((r) => r.kind === "edge.throw").map((r) => r.entityId))

  const verdict = (recordedHere: boolean, recordedAnywhere: boolean) =>
    recordedHere ? "in the replay"
      : recordedAnywhere ? "RECORDED, NOT PLACED in this reading"
        : "NEVER RECORDED — predates the log, or its path emitted no event"

  console.log(`live in this reading : ${liveConcepts.length} concepts · ${liveEdges.length} threads · ${here.length} passages`)
  console.log(`acts placed here     : ${mine.length}`)
  console.log(`  ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join("  ")}\n`)

  console.log("CONCEPTS")
  for (const c of liveConcepts) {
    console.log(`  ${verdict(created.has(c.id), anyCreate.has(c.id)).padEnd(52)} ${c.label}`)
  }
  console.log("\nTHREADS")
  for (const e of liveEdges) {
    const f = state.concepts.find((c) => c.id === e.fromId)?.label ?? "?"
    const t = state.concepts.find((c) => c.id === e.toId)?.label ?? "?"
    console.log(`  ${verdict(thrown.has(e.id), anyThrow.has(e.id)).padEnd(52)} ${f} → ${t}`)
  }
  console.log("\nPASSAGES")
  for (const b of here) {
    const label = (b.content ?? "").slice(0, 44).replace(/\s+/g, " ")
    console.log(`  ${verdict(capturedIds.has(b.id), anyCapture.has(b.id)).padEnd(52)} "${label}…"`)
  }

}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
