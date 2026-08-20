/**
 * Give a pre-stamp act the reading it happened in — but only when the RECORD
 * says which, never by inference.
 *
 * Acts began carrying `payload.sourceId` on 2026-08-11. Older ones are placed
 * in a reading by evidence instead: a concept belongs where one of its
 * passages is. That fallback fails for a concept whose passages have since
 * been deleted — the act becomes unplaceable, and 03's replay ends short of
 * the cloth it is a replay of (TJ, 2026-08-12: "why does the timeline not look
 * like the cloth at the end?").
 *
 * WHAT IT WILL AND WILL NOT DO. It stamps an act only when another act in the
 * same record names the reading for it:
 *
 *   · a `concept.create` whose passage — created in the same minute, deleted
 *     later — recorded the reading in its own `passage.create` /
 *     `passage.delete` payload;
 *   · an `edge.throw` between two concepts that were both evidenced in that
 *     reading at the time it was thrown.
 *
 * Anything it cannot source that way it leaves alone and says so. It never
 * invents a reading, never touches an act that already carries a stamp, and
 * never writes anything but `payload.sourceId`.
 *
 * THIS EDITS THE RECORD, which is otherwise append-only and immutable. That is
 * the reason for the dry run: it prints every change and writes nothing unless
 * you pass --apply.
 *
 *   npx tsx scripts/backfill-log-stamp.ts <email> "<reading fragment>"
 *   npx tsx scripts/backfill-log-stamp.ts <email> "<reading fragment>" --apply
 */
import { eq, asc } from "drizzle-orm"
import { db, databaseLabel } from "../src/db"
import { users, concepts, passages, passageConcepts, edges, sources, graphEvents } from "../src/db/schema"

async function main() {
  const email = process.argv[2] ?? "tjm@tjmcleish.com"
  const want = (process.argv[3] ?? "Learning How to Learn").toLowerCase()
  const apply = process.argv.includes("--apply")

  console.log(`database ${databaseLabel()}`)
  console.log(apply ? "MODE     apply — this writes\n" : "MODE     dry run — nothing is written (pass --apply)\n")

  const user = (await db.select().from(users).where(eq(users.email, email)))[0]
  if (!user) throw new Error(`no user for ${email}`)
  const source = (await db.select().from(sources)).find((s) => (s.title ?? "").toLowerCase().includes(want))
  if (!source) throw new Error(`no reading matching "${want}"`)
  console.log(`user     ${user.name}\nreading  ${source.title}\n`)

  const rows = await db.select().from(graphEvents).where(eq(graphEvents.userId, user.id)).orderBy(asc(graphEvents.at))
  const myConcepts = await db.select().from(concepts).where(eq(concepts.userId, user.id))
  const myPassages = await db.select().from(passages).where(eq(passages.userId, user.id))
  const myEdges = await db.select().from(edges).where(eq(edges.userId, user.id))
  const links = await db.select().from(passageConcepts)
  const labelOf = (id: string) => myConcepts.find((c) => c.id === id)?.label ?? id.slice(0, 8)

  const pay = (e: (typeof rows)[number]) => (e.payload ?? {}) as Record<string, unknown>
  const unstamped = (e: (typeof rows)[number]) => !("sourceId" in pay(e))

  /** Every reading a passage act ever named for this passage id. */
  const readingOfPassage = (passageId: string): string | null => {
    for (const e of rows) {
      if (e.entityId !== passageId) continue
      const p = pay(e)
      if (typeof p.sourceId === "string") return p.sourceId
      // The oldest passage acts recorded the source as a TITLE string.
      if (typeof p.source === "string" && p.source.trim()) {
        const hit = (source.title ?? "").trim() === p.source.trim() ? source.id : null
        if (hit) return hit
      }
    }
    const live = myPassages.find((p) => p.id === passageId)
    return live?.sourceId ?? null
  }

  const planned: { id: string; kind: string; what: string; why: string }[] = []

  // --- concepts: the passage they were born with names the reading ---------
  for (const e of rows) {
    if (e.kind !== "concept.create" || !e.entityId || !unstamped(e)) continue
    const cid = e.entityId
    // A concept still evidenced here needs nothing: evidence places it.
    const evidencedHere = links.some((l) => l.conceptId === cid &&
      myPassages.find((p) => p.id === l.passageId)?.sourceId === source.id)
    if (evidencedHere) continue
    // Its sibling acts: passage acts naming this concept, within two minutes.
    const sibling = rows.find((x) => x.entityType === "passage" &&
      Math.abs(x.at.getTime() - e.at.getTime()) < 120_000 &&
      (pay(x).conceptId === cid || (Array.isArray(pay(x).conceptIds) && (pay(x).conceptIds as unknown[]).includes(cid))))
    if (!sibling?.entityId) continue
    const readingId = readingOfPassage(sibling.entityId)
    if (readingId !== source.id) continue
    planned.push({
      id: e.id, kind: e.kind, what: `"${labelOf(cid)}"`,
      why: `born with passage ${sibling.entityId.slice(0, 8)}, which the record places in this reading`,
    })
  }

  // --- threads: both ends evidenced here when it was thrown ----------------
  const stampedIds = new Set(planned.map((p) => p.id))
  for (const e of rows) {
    if (e.kind !== "edge.throw" || !e.entityId || !unstamped(e)) continue
    const p = pay(e)
    const edge = myEdges.find((x) => x.id === e.entityId)
    const fromId = typeof p.fromId === "string" ? p.fromId : edge?.fromId
    const toId = typeof p.toId === "string" ? p.toId : edge?.toId
    if (!fromId || !toId) continue
    // "Evidenced here" as of the throw: a passage in this reading filed under
    // it, OR a concept this run is about to stamp into this reading.
    const wasHere = (cid: string) =>
      links.some((l) => l.conceptId === cid && myPassages.find((x) => x.id === l.passageId)?.sourceId === source.id) ||
      planned.some((q) => q.what === `"${labelOf(cid)}"` && stampedIds.has(q.id))
    if (!wasHere(fromId) || !wasHere(toId)) continue
    planned.push({
      id: e.id, kind: e.kind, what: `${labelOf(fromId)} → ${labelOf(toId)}`,
      why: "both ends were evidenced in this reading when it was thrown",
    })
  }

  if (!planned.length) {
    console.log("nothing to stamp — every unplaceable act here lacks a recorded reading.")
    return
  }
  for (const p of planned) console.log(`  ${p.kind.padEnd(14)} ${p.what}\n      ${p.why}`)
  console.log(`\n${planned.length} act${planned.length === 1 ? "" : "s"}${apply ? " stamped." : " would be stamped."}`)

  if (!apply) return
  for (const p of planned) {
    const row = rows.find((r) => r.id === p.id)!
    await db.update(graphEvents)
      .set({ payload: { ...(row.payload as Record<string, unknown> ?? {}), sourceId: source.id } })
      .where(eq(graphEvents.id, p.id))
  }
  console.log("done.")
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
