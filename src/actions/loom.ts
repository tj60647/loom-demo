"use server"

import { db } from "@/db"
import { concepts, bytes, edges, users, sourcePages, sources, reads, views, graphEvents } from "@/db/schema"
import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { resolveCourseIdForUser } from "@/lib/courses"
import type { CardTableView, GraphEvent, Tier } from "@/lib/types"
import type { ParsedImport } from "@/lib/graphExport"
import { WORKED_EXAMPLE } from "@/lib/example"

async function getUserId() {
  const session = await getServerSession(authOptions)
  let userId = session?.user?.id;

  if (!userId && process.env.NODE_ENV !== 'production') {
    const testUser = await db.select().from(users).where(eq(users.email, "tjm@tjmcleish.com")).limit(1);
    if (testUser.length > 0) userId = testUser[0].id;
  }

  if (!userId) throw new Error("Unauthorized")
  return userId;
}

/**
 * The course this learner's work belongs to. Courses now come from the
 * database rather than a hardcoded list, so this can legitimately be null on a
 * site with no courses yet; callers store null and the work stays unscoped
 * until a course exists.
 */
async function resolveActiveCourseId(userId: string, courseIdRaw?: string | null) {
  const courseId = await resolveCourseIdForUser(userId, courseIdRaw)
  if (!courseId) return null

  // Pre-course-scoping rows carry a null courseId. Adopt them into whichever
  // course this learner is actually working in.
  await db.update(concepts).set({ courseId }).where(and(eq(concepts.userId, userId), isNull(concepts.courseId)))
  await db.update(bytes).set({ courseId }).where(and(eq(bytes.userId, userId), isNull(bytes.courseId)))
  await db.update(edges).set({ courseId }).where(and(eq(edges.userId, userId), isNull(edges.courseId)))
  await db.update(graphEvents).set({ courseId }).where(and(eq(graphEvents.userId, userId), isNull(graphEvents.courseId)))

  // read and view carry unique constraints, so a blind UPDATE could collide
  // with a row the target course already has (e.g. after a course delete set
  // rows back to null) — and, running at the top of every action, that would
  // wedge the student out entirely. Merge instead: the scoped row wins, the
  // null-course leftover is dropped.
  await db.delete(reads).where(and(
    eq(reads.userId, userId),
    isNull(reads.courseId),
    sql`exists (select 1 from ${reads} r2 where r2."userId" = ${userId} and r2."courseId" = ${courseId})`
  ))
  await db.update(reads).set({ courseId }).where(and(eq(reads.userId, userId), isNull(reads.courseId)))

  await db.delete(views).where(and(
    eq(views.userId, userId),
    isNull(views.courseId),
    sql`exists (select 1 from ${views} v2 where v2."userId" = ${userId} and v2."courseId" = ${courseId} and v2."key" = ${views.key})`
  ))
  await db.update(views).set({ courseId }).where(and(eq(views.userId, userId), isNull(views.courseId)))

  return courseId
}

/**
 * Matches rows for the active course. With no course on the site yet, that
 * means the rows whose courseId is still null, so a learner's work stays
 * reachable until an instructor creates one.
 */
function inCourse(column: PgColumn, courseId: string | null): SQL {
  return courseId ? eq(column, courseId) : isNull(column)
}

/**
 * Append one student act to the graph's development history. Best-effort by
 * design: neon-http has no cross-call transactions, so the graph tables stay
 * the source of truth and a lost event never fails the mutation it describes.
 * History is an exploratory record (rendered as counts and replay, never
 * judgment) and deliberately survives reset and import.
 */
async function recordEvent(
  userId: string,
  courseId: string | null,
  kind: string,
  entityType: "concept" | "byte" | "edge" | "graph",
  entityId: string | null,
  payload?: Record<string, unknown>
) {
  try {
    await db.insert(graphEvents).values({ userId, courseId, kind, entityType, entityId, payload })
  } catch (e) {
    console.warn(`[recordEvent] failed to record ${kind}`, e)
  }
}

/**
 * Drop deleted entities' geometry from the card-table view row so the stored
 * view never accumulates keys for rows that no longer exist. Best-effort: the
 * view is a projection, never the source of truth.
 */
async function pruneCardTable(
  userId: string,
  courseId: string | null,
  prune: { positions?: string[]; bends?: string[] }
) {
  try {
    const rows = await db.select().from(views)
      .where(and(eq(views.userId, userId), inCourse(views.courseId, courseId), eq(views.key, "cardTable")))
      .orderBy(desc(views.updatedAt))
      .limit(1)
    const row = rows[0]
    if (!row) return
    const data = row.data as Partial<CardTableView>
    const positions = { ...(data.positions ?? {}) }
    const bends = { ...(data.bends ?? {}) }
    let changed = false
    prune.positions?.forEach((id) => { if (id in positions) { delete positions[id]; changed = true } })
    prune.bends?.forEach((id) => { if (id in bends) { delete bends[id]; changed = true } })
    if (changed) {
      await db.update(views).set({ data: { positions, bends }, updatedAt: new Date() }).where(eq(views.id, row.id))
    }
  } catch (e) {
    console.warn("[pruneCardTable] failed", e)
  }
}

export async function getUserLoomData() {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  // Capture order is meaning: the arc map's "warp in reading order" and the
  // coding log both assume rows come back in the order they were made.
  const userConcepts = await db.select().from(concepts)
    .where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
    .orderBy(asc(concepts.createdAt), asc(concepts.id))
  const userBytes = await db.select().from(bytes)
    .where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
    .orderBy(asc(bytes.createdAt), asc(bytes.id))
  const userEdges = await db.select().from(edges)
    .where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId)))
    .orderBy(asc(edges.createdAt), asc(edges.id))
  const readRows = await db.select().from(reads)
    .where(and(eq(reads.userId, userId), inCourse(reads.courseId, courseId)))
    .orderBy(desc(reads.updatedAt))
    .limit(1)
  const viewRows = await db.select().from(views)
    .where(and(eq(views.userId, userId), inCourse(views.courseId, courseId), eq(views.key, "cardTable")))
    .orderBy(desc(views.updatedAt))
    .limit(1)

  const cardTableData = (viewRows[0]?.data ?? {}) as Partial<CardTableView>
  const cardTable: CardTableView = {
    positions: cardTableData.positions ?? {},
    bends: cardTableData.bends ?? {},
  }

  return {
    concepts: userConcepts,
    bytes: userBytes,
    edges: userEdges,
    read: readRows[0]?.text ?? "",
    views: { cardTable },
  }
}

export async function createConcept(data: { label: string, def?: string, note?: string }) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const newConcept = await db.insert(concepts).values({
    courseId,
    userId,
    label: data.label,
    def: data.def || "",
    note: data.note || "",
  }).returning()

  await recordEvent(userId, courseId, "concept.create", "concept", newConcept[0].id, {
    label: data.label,
    def: data.def || "",
  })
  return newConcept[0]
}

export async function updateConcept(id: string, data: Partial<{ label: string, def: string, note: string, tier: Tier }>) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  // One label is one concept (§2 identity). A rename that collides with
  // another concept's label would silently mint a duplicate identity.
  if (data.label !== undefined) {
    const clash = await db.select({ id: concepts.id }).from(concepts)
      .where(and(
        eq(concepts.userId, userId),
        inCourse(concepts.courseId, courseId),
        ne(concepts.id, id),
        sql`lower(${concepts.label}) = lower(${data.label})`
      ))
      .limit(1)
    if (clash.length > 0) {
      throw new Error("That name is already one of your concepts.")
    }
  }

  const updated = await db.update(concepts).set(data)
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
    .returning({ id: concepts.id })

  if (updated.length > 0) {
    const kind =
      data.tier !== undefined ? "concept.retier" :
      data.label !== undefined ? "concept.rename" :
      "concept.update"
    await recordEvent(userId, courseId, kind, "concept", id, { ...data })
  }
}

export async function deleteConcept(id: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  // v14 guard: a concept woven into a thrown thread cannot be deleted out from
  // under its edges — that would silently destroy authored relations (red line
  // #5 adjacent). The client alerts first; this is the backstop.
  const usedInThread = await db.select({ id: edges.id }).from(edges)
    .where(and(eq(edges.userId, userId), or(eq(edges.fromId, id), eq(edges.toId, id))))
    .limit(1)
  if (usedInThread.length > 0) {
    throw new Error("Used in a thrown thread. Remove the thread first.")
  }

  const removed = await db.delete(concepts)
    .where(and(eq(concepts.id, id), eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
    .returning({ label: concepts.label })
  if (removed.length > 0) {
    await recordEvent(userId, courseId, "concept.delete", "concept", id, { label: removed[0].label })
    await pruneCardTable(userId, courseId, { positions: [id] })
  }
}

function findClosestTextIndex(text: string, needle: string, preferredStart?: number) {
  if (!needle) return -1

  let bestIndex = -1
  let bestDistance = Number.POSITIVE_INFINITY
  let index = text.indexOf(needle)

  while (index !== -1) {
    const distance = preferredStart == null ? index : Math.abs(index - preferredStart)
    if (distance < bestDistance) {
      bestIndex = index
      bestDistance = distance
    }
    index = text.indexOf(needle, index + Math.max(needle.length, 1))
  }

  return bestIndex
}

export async function createByte(data: { conceptId: string, source: string, sourceId?: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, pageContentHash?: string }) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  let startOffset = data.startOffset
  let endOffset = data.endOffset
  let pageContentHash = data.pageContentHash

  // If the browser and server agree on the page text hash, prefer canonical
  // server offsets. If they differ, keep the browser offsets with the browser
  // text-layer hash they were computed against, so return-highlighting can use
  // precise markRanges instead of broad fuzzy matching.
  if (data.sourceId && data.pageNumber != null) {
    const rows = await db.select().from(sourcePages).where(
      and(eq(sourcePages.sourceId, data.sourceId), eq(sourcePages.pageNumber, data.pageNumber))
    ).limit(1)
    const page = rows[0]

    if (page) {
      const canonicalIndex = findClosestTextIndex(page.textContent, data.content, data.startOffset)
      const clientTextMatchesCanonical = !data.pageContentHash || data.pageContentHash === page.contentHash

      if (canonicalIndex !== -1 && clientTextMatchesCanonical) {
        pageContentHash = page.contentHash
        startOffset = canonicalIndex
        endOffset = canonicalIndex + data.content.length
      } else {
        pageContentHash = data.pageContentHash ?? page.contentHash
        if (canonicalIndex === -1) {
          console.warn(`[createByte] Could not anchor byte content to sourcePage ${data.sourceId}#${data.pageNumber}; falling back to client-provided offsets.`)
        } else {
          console.warn(`[createByte] Browser text layer differs from sourcePage ${data.sourceId}#${data.pageNumber}; preserving client-provided offsets.`)
        }
      }
    }
  }

  const newByte = await db.insert(bytes).values({
    courseId,
    userId,
    conceptId: data.conceptId,
    source: data.source,
    sourceId: data.sourceId,
    location: data.location,
    content: data.content,
    pageNumber: data.pageNumber,
    startOffset,
    endOffset,
    pageContentHash,
  }).returning()

  await recordEvent(userId, courseId, "byte.create", "byte", newByte[0].id, {
    conceptId: data.conceptId,
    source: data.source,
    location: data.location,
  })
  return newByte[0]
}

/**
 * Re-file a passage under a second concept (spec §3 Open; red line #2 names
 * re-file as permitted capture automation). v1 semantics: the byte row is
 * copied — byte→concept many-to-many is deferred until quilting forces it.
 */
export async function refileByte(byteId: string, conceptId: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const rows = await db.select().from(bytes)
    .where(and(eq(bytes.id, byteId), eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
    .limit(1)
  const src = rows[0]
  if (!src) throw new Error("Byte not found.")

  const already = await db.select({ id: bytes.id }).from(bytes)
    .where(and(eq(bytes.userId, userId), eq(bytes.conceptId, conceptId), eq(bytes.content, src.content)))
    .limit(1)
  if (already.length > 0) throw new Error("Already filed under that concept.")

  const newByte = await db.insert(bytes).values({
    courseId,
    userId,
    conceptId,
    source: src.source,
    sourceId: src.sourceId,
    location: src.location,
    content: src.content,
    pageNumber: src.pageNumber,
    startOffset: src.startOffset,
    endOffset: src.endOffset,
    pageContentHash: src.pageContentHash,
  }).returning()

  await recordEvent(userId, courseId, "byte.refile", "byte", newByte[0].id, {
    conceptId,
    fromByteId: byteId,
    source: src.source,
  })
  return newByte[0]
}

export async function deleteByte(id: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const removed = await db.delete(bytes)
    .where(and(eq(bytes.id, id), eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
    .returning({ conceptId: bytes.conceptId })
  if (removed.length > 0) {
    await recordEvent(userId, courseId, "byte.delete", "byte", id, { conceptId: removed[0].conceptId })
  }
}

export async function createEdge(data: { fromId: string, toId: string, sentence: string }) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const newEdge = await db.insert(edges).values({
    courseId,
    userId,
    fromId: data.fromId,
    toId: data.toId,
    sentence: data.sentence,
  }).returning()

  await recordEvent(userId, courseId, "edge.throw", "edge", newEdge[0].id, {
    fromId: data.fromId,
    toId: data.toId,
    sentence: data.sentence,
  })
  return newEdge[0]
}

export async function updateEdge(id: string, data: Partial<{ handle: string, sentence: string }>) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const updated = await db.update(edges).set(data)
    .where(and(eq(edges.id, id), eq(edges.userId, userId), inCourse(edges.courseId, courseId)))
    .returning({ id: edges.id })

  if (updated.length > 0) {
    const kind = data.handle !== undefined ? "edge.coin" : "edge.update"
    await recordEvent(userId, courseId, kind, "edge", id, { ...data })
  }
}

export async function deleteEdge(id: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const removed = await db.delete(edges)
    .where(and(eq(edges.id, id), eq(edges.userId, userId), inCourse(edges.courseId, courseId)))
    .returning({ fromId: edges.fromId, toId: edges.toId })
  if (removed.length > 0) {
    await recordEvent(userId, courseId, "edge.delete", "edge", id, removed[0])
    await pruneCardTable(userId, courseId, { bends: [id] })
  }
}

/**
 * "Your read" — part of the graph artifact (§6), persisted so it is never lost
 * on refresh (red line #5). Debounced client-side; the event records length
 * only, not every draft. Upsert against the (userId, courseId) unique so
 * concurrent saves can never mint duplicate rows.
 */
export async function saveRead(text: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  await db.insert(reads).values({ userId, courseId, text }).onConflictDoUpdate({
    target: [reads.userId, reads.courseId],
    set: { text, updatedAt: new Date() },
  })
  await recordEvent(userId, courseId, "read.update", "graph", null, { chars: text.length })
}

/**
 * Persist student-authored view geometry (spec §6 `views`). Only student
 * gestures reach this — derived auto-layout must be computed for display and
 * discarded, never saved (red line #7). No history event: views are
 * projections of the graph, not part of its development.
 */
export async function saveView(key: "cardTable", data: CardTableView) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  await db.insert(views).values({ userId, courseId, key, data }).onConflictDoUpdate({
    target: [views.userId, views.courseId, views.key],
    set: { data, updatedAt: new Date() },
  })
}

/**
 * The development history of this learner's graph, oldest first. Rows created
 * before event recording existed get synthesized creation events from their
 * createdAt, so the timeline starts honestly rather than empty. (Deletions
 * from before recording are unknowable and stay absent; imported and example
 * eras replay from the snapshot on their graph.import / graph.example event.)
 */
export async function getGraphEvents(): Promise<GraphEvent[]> {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const recorded = await db.select().from(graphEvents)
    .where(and(eq(graphEvents.userId, userId), inCourse(graphEvents.courseId, courseId)))
    .orderBy(asc(graphEvents.at), asc(graphEvents.id))

  const covered = new Set(
    recorded
      .filter((e) => e.kind.endsWith(".create") || e.kind === "edge.throw" || e.kind === "byte.refile")
      .map((e) => e.entityId)
  )
  // Rows born inside an import/example land in that event's snapshot; don't
  // also synthesize creates for them or they'd replay twice.
  recorded
    .filter((e) => e.kind === "graph.import" || e.kind === "graph.example")
    .forEach((e) => {
      const snapshot = (e.payload as { snapshot?: { concepts?: { id: string }[]; bytes?: { id: string }[]; edges?: { id: string }[] } } | null)?.snapshot
      snapshot?.concepts?.forEach((c) => covered.add(c.id))
      snapshot?.bytes?.forEach((b) => covered.add(b.id))
      snapshot?.edges?.forEach((ed) => covered.add(ed.id))
    })

  const [userConcepts, userBytes, userEdges] = [
    await db.select().from(concepts).where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId))).orderBy(asc(concepts.createdAt), asc(concepts.id)),
    await db.select().from(bytes).where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId))).orderBy(asc(bytes.createdAt), asc(bytes.id)),
    await db.select().from(edges).where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId))).orderBy(asc(edges.createdAt), asc(edges.id)),
  ]

  const synthesized: GraphEvent[] = []
  userConcepts.filter((c) => !covered.has(c.id)).forEach((c) =>
    synthesized.push({
      id: `synth-c-${c.id}`, userId, courseId, kind: "concept.create", entityType: "concept",
      entityId: c.id, payload: { label: c.label, tier: c.tier, synthesized: true }, at: c.createdAt,
    })
  )
  userBytes.filter((b) => !covered.has(b.id)).forEach((b) =>
    synthesized.push({
      id: `synth-b-${b.id}`, userId, courseId, kind: "byte.create", entityType: "byte",
      entityId: b.id, payload: { conceptId: b.conceptId, source: b.source, synthesized: true }, at: b.createdAt,
    })
  )
  userEdges.filter((e) => !covered.has(e.id)).forEach((e) =>
    synthesized.push({
      id: `synth-e-${e.id}`, userId, courseId, kind: "edge.throw", entityType: "edge",
      entityId: e.id, payload: { fromId: e.fromId, toId: e.toId, sentence: e.sentence, synthesized: true }, at: e.createdAt,
    })
  )

  return [...recorded, ...synthesized].sort((a, b) => a.at.getTime() - b.at.getTime())
}

/**
 * Clear the cloth and start blank (spec §3 Global). Deletes the graph and its
 * views atomically; the history deliberately survives — reset clears the
 * cloth, not the loom's memory of weaving.
 */
export async function resetGraph() {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const counts = {
    concepts: (await db.select({ id: concepts.id }).from(concepts).where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))).length,
    edges: (await db.select({ id: edges.id }).from(edges).where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId)))).length,
  }
  await recordEvent(userId, courseId, "graph.reset", "graph", null, counts)

  await db.batch([
    db.delete(edges).where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId))),
    db.delete(bytes).where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId))),
    db.delete(concepts).where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId))),
    db.delete(reads).where(and(eq(reads.userId, userId), inCourse(reads.courseId, courseId))),
    db.delete(views).where(and(eq(views.userId, userId), inCourse(views.courseId, courseId))),
  ])
}

const IMPORT_LIMITS = { concepts: 400, bytes: 2000, edges: 2000 }

type GraphSnapshot = {
  concepts: { id: string; label: string; tier: Tier }[]
  bytes: { id: string; conceptId: string }[]
  edges: { id: string; fromId: string; toId: string; sentence: string; handle: string }[]
}

/**
 * Replace this learner's graph with an imported one (spec §3 Global). The
 * client parses (accepting §6, v14-flat, and legacy shapes via
 * lib/graphExport.parseImport) and confirms the replacement; the server remints
 * ids and remaps the imported view geometry. The whole replacement runs as ONE
 * atomic batch — a mid-import failure leaves the previous graph untouched.
 * One graph.import event records the act, carrying a row snapshot so the
 * history can still replay this era after a later reset; like reset, history
 * survives.
 */
export async function importGraph(parsed: ParsedImport) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  if (parsed.concepts.length > IMPORT_LIMITS.concepts ||
      parsed.bytes.length > IMPORT_LIMITS.bytes ||
      parsed.edges.length > IMPORT_LIMITS.edges) {
    throw new Error("That export is larger than an import will accept.")
  }

  // Imported anchors may point at readings this deployment doesn't have; only
  // keep sourceIds the FK will accept.
  const anchorIds = [...new Set(parsed.bytes.map((b) => b.anchor?.sourceId).filter((v): v is string => !!v))]
  const knownSources = anchorIds.length
    ? new Set((await db.select({ id: sources.id }).from(sources).where(inArray(sources.id, anchorIds))).map((r) => r.id))
    : new Set<string>()

  // Remint every id up front so the rows, the view remap, and the history
  // snapshot all agree before anything touches the database.
  const conceptIdByKey = new Map(parsed.concepts.map((c) => [c.key, crypto.randomUUID()]))
  const edgeIdByKey = new Map<string, string>()

  const conceptRows = parsed.concepts.map((c) => ({
    id: conceptIdByKey.get(c.key)!,
    courseId, userId, label: c.label, def: c.def, note: c.note, tier: c.tier,
  }))
  const byteRows = parsed.bytes
    .filter((b) => conceptIdByKey.has(b.conceptKey))
    .map((b) => {
      const anchor = b.anchor && knownSources.has(b.anchor.sourceId) ? b.anchor : undefined
      return {
        id: crypto.randomUUID(),
        courseId, userId,
        conceptId: conceptIdByKey.get(b.conceptKey)!,
        source: b.source, location: b.location, content: b.text,
        sourceId: anchor?.sourceId,
        pageNumber: anchor?.pageNumber ?? undefined,
        startOffset: anchor?.startOffset ?? undefined,
        endOffset: anchor?.endOffset ?? undefined,
        pageContentHash: anchor?.pageContentHash ?? undefined,
      }
    })
  const edgeRows = parsed.edges
    .filter((e) => conceptIdByKey.has(e.fromKey) && conceptIdByKey.has(e.toKey))
    .map((e) => {
      const id = crypto.randomUUID()
      edgeIdByKey.set(e.key, id)
      return {
        id, courseId, userId,
        fromId: conceptIdByKey.get(e.fromKey)!,
        toId: conceptIdByKey.get(e.toKey)!,
        sentence: e.sentence, handle: e.handle,
      }
    })

  const positions: CardTableView["positions"] = {}
  Object.entries(parsed.cardTable.positions).forEach(([key, p]) => {
    const id = conceptIdByKey.get(key)
    if (id) positions[id] = p
  })
  const bends: CardTableView["bends"] = {}
  Object.entries(parsed.cardTable.bends).forEach(([key, b]) => {
    const id = edgeIdByKey.get(key)
    if (id) bends[id] = b
  })

  const snapshot: GraphSnapshot = {
    concepts: conceptRows.map((c) => ({ id: c.id, label: c.label, tier: c.tier })),
    bytes: byteRows.map((b) => ({ id: b.id, conceptId: b.conceptId })),
    edges: edgeRows.map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId, sentence: e.sentence, handle: e.handle })),
  }
  await recordEvent(userId, courseId, "graph.import", "graph", null, {
    concepts: conceptRows.length,
    bytes: byteRows.length,
    edges: edgeRows.length,
    snapshot,
  })

  const statements = [
    db.delete(edges).where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId))),
    db.delete(bytes).where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId))),
    db.delete(concepts).where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId))),
    db.delete(reads).where(and(eq(reads.userId, userId), inCourse(reads.courseId, courseId))),
    db.delete(views).where(and(eq(views.userId, userId), inCourse(views.courseId, courseId))),
    ...(conceptRows.length ? [db.insert(concepts).values(conceptRows)] : []),
    ...(byteRows.length ? [db.insert(bytes).values(byteRows)] : []),
    ...(edgeRows.length ? [db.insert(edges).values(edgeRows)] : []),
    ...(parsed.read ? [db.insert(reads).values({ userId, courseId, text: parsed.read })] : []),
    ...(Object.keys(positions).length || Object.keys(bends).length
      ? [db.insert(views).values({ userId, courseId, key: "cardTable", data: { positions, bends } })]
      : []),
  ]
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  return getUserLoomData()
}

/**
 * Load the Star & Griesemer worked example (spec §7 seed/example knob) into an
 * EMPTY loom. Static authored content by an explicit student act — nothing is
 * generated (red lines #1/#2); reset removes it. The graph.example event
 * carries a row snapshot so the history can replay this era after a reset.
 */
export async function loadWorkedExample() {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const existing = await db.select({ id: concepts.id }).from(concepts)
    .where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
    .limit(1)
  if (existing.length > 0) {
    throw new Error("The worked example only loads into an empty loom — reset first if you mean to.")
  }

  const conceptIdByKey = new Map(WORKED_EXAMPLE.concepts.map((c) => [c.key, crypto.randomUUID()]))
  const conceptRows = WORKED_EXAMPLE.concepts.map((c) => ({
    id: conceptIdByKey.get(c.key)!,
    courseId, userId, label: c.label, def: c.def, note: c.note, tier: c.tier,
  }))
  const byteRows = WORKED_EXAMPLE.bytes
    .filter((b) => conceptIdByKey.has(b.conceptKey))
    .map((b) => ({
      id: crypto.randomUUID(),
      courseId, userId,
      conceptId: conceptIdByKey.get(b.conceptKey)!,
      source: b.source, location: b.location, content: b.text,
    }))
  const edgeRows = WORKED_EXAMPLE.edges
    .filter((e) => conceptIdByKey.has(e.fromKey) && conceptIdByKey.has(e.toKey))
    .map((e) => ({
      id: crypto.randomUUID(),
      courseId, userId,
      fromId: conceptIdByKey.get(e.fromKey)!,
      toId: conceptIdByKey.get(e.toKey)!,
      sentence: e.sentence, handle: e.handle,
    }))

  const snapshot: GraphSnapshot = {
    concepts: conceptRows.map((c) => ({ id: c.id, label: c.label, tier: c.tier })),
    bytes: byteRows.map((b) => ({ id: b.id, conceptId: b.conceptId })),
    edges: edgeRows.map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId, sentence: e.sentence, handle: e.handle })),
  }
  await recordEvent(userId, courseId, "graph.example", "graph", null, {
    title: WORKED_EXAMPLE.title,
    snapshot,
  })

  await db.batch([
    db.insert(concepts).values(conceptRows),
    db.insert(bytes).values(byteRows),
    db.insert(edges).values(edgeRows),
    db.insert(reads).values({ userId, courseId, text: WORKED_EXAMPLE.read }).onConflictDoUpdate({
      target: [reads.userId, reads.courseId],
      set: { text: WORKED_EXAMPLE.read, updatedAt: new Date() },
    }),
  ])

  return getUserLoomData()
}
