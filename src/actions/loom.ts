"use server"

import { db } from "@/db"
import { concepts, bytes, byteConcepts, edges, users, sourcePages, sources, cloths, views, graphEvents, maps } from "@/db/schema"
import { and, asc, eq, inArray, isNull, like, ne, or, sql, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { resolveCourseIdForUser } from "@/lib/courses"
import { scopeFromKey, scopeOf } from "@/lib/scope"
import type { Byte, CardTableView, GraphEvent, LoomMap, LoomViews, PassageTier, Tier } from "@/lib/types"
import type { ParsedImport, ParsedMapImport } from "@/lib/graphExport"
import { WORKED_EXAMPLE, WORKED_EXAMPLE_SOURCE } from "@/lib/example"
import { textLayerProjection } from "@/lib/pdfText"
import { authorizeSourceAccess } from "@/actions/sources"

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
  await db.update(maps).set({ courseId }).where(and(eq(maps.userId, userId), isNull(maps.courseId)))

  // cloth and view carry unique constraints, so a blind UPDATE could collide
  // with a row the target course already has (e.g. after a course delete set
  // rows back to null) — and, running at the top of every action, that would
  // wedge the student out entirely. Merge instead: the scoped row wins, the
  // null-course leftover is dropped.
  await db.delete(cloths).where(and(
    eq(cloths.userId, userId),
    isNull(cloths.courseId),
    sql`exists (select 1 from ${cloths} c2 where c2."userId" = ${userId} and c2."courseId" = ${courseId} and c2."scopeKey" = ${cloths.scopeKey})`
  ))
  await db.update(cloths).set({ courseId }).where(and(eq(cloths.userId, userId), isNull(cloths.courseId)))

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
  entityType: "concept" | "byte" | "edge" | "graph" | "map" | "cloth",
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
 * Drop deleted entities' geometry from every view row — the legacy cardTable
 * and each map's own `map:<id>` — and, when `tiers` names deleted concepts,
 * from every map's tier record, so no stored projection accumulates keys for
 * rows that no longer exist. Best-effort: views are projections, never the
 * source of truth, and tier cleanup is the same hygiene (the concept.delete
 * event is the record of the act).
 */
async function pruneViews(
  userId: string,
  courseId: string | null,
  prune: { positions?: string[]; bends?: string[]; order?: string[]; pins?: string[]; tiers?: string[] }
) {
  try {
    const rows = await db.select().from(views)
      .where(and(
        eq(views.userId, userId),
        inCourse(views.courseId, courseId),
        or(eq(views.key, "cardTable"), like(views.key, "map:%"))
      ))
    for (const row of rows) {
      const data = row.data as Partial<CardTableView>
      const positions = { ...(data.positions ?? {}) }
      const bends = { ...(data.bends ?? {}) }
      let order = data.order ? [...data.order] : undefined
      let pins = data.pins ? [...data.pins] : undefined
      let changed = false
      prune.positions?.forEach((id) => { if (id in positions) { delete positions[id]; changed = true } })
      prune.bends?.forEach((id) => { if (id in bends) { delete bends[id]; changed = true } })
      if (order && prune.order?.length) {
        const drop = new Set(prune.order)
        const next = order.filter((id) => !drop.has(id))
        if (next.length !== order.length) { order = next; changed = true }
      }
      if (pins && prune.pins?.length) {
        const drop = new Set(prune.pins)
        const next = pins.filter((id) => !drop.has(id))
        if (next.length !== pins.length) { pins = next; changed = true }
      }
      if (changed) {
        await db.update(views).set({
          data: {
            positions,
            bends,
            ...(order ? { order } : {}),
            ...(pins ? { pins } : {}),
          },
          updatedAt: new Date(),
        }).where(eq(views.id, row.id))
      }
    }
    if (prune.tiers?.length) {
      const mapRows = await db.select().from(maps)
        .where(and(eq(maps.userId, userId), inCourse(maps.courseId, courseId)))
      for (const m of mapRows) {
        const next = { ...m.tiers }
        let changed = false
        prune.tiers.forEach((id) => { if (id in next) { delete next[id]; changed = true } })
        // updatedAt deliberately untouched: pruning is hygiene, not a student
        // act, and must not reshuffle "most recently worked on" selection.
        if (changed) await db.update(maps).set({ tiers: next }).where(eq(maps.id, m.id))
      }
    }
  } catch (e) {
    console.warn("[pruneViews] failed", e)
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
  const byteRows = await db.select().from(bytes)
    .where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
    .orderBy(asc(bytes.createdAt), asc(bytes.id))
  // The passage↔concept pointers, in the order they were filed — folded onto
  // each byte as `conceptIds` so the client sees one object per passage.
  const junctionRows = await db.select({
    byteId: byteConcepts.byteId,
    conceptId: byteConcepts.conceptId,
  }).from(byteConcepts)
    .innerJoin(bytes, eq(byteConcepts.byteId, bytes.id))
    .where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
    .orderBy(asc(byteConcepts.createdAt), asc(byteConcepts.conceptId))
  const conceptIdsByByte = new Map<string, string[]>()
  junctionRows.forEach((row) => {
    const list = conceptIdsByByte.get(row.byteId) ?? []
    list.push(row.conceptId)
    conceptIdsByByte.set(row.byteId, list)
  })
  const userBytes: Byte[] = byteRows.map((b) => ({
    ...b,
    conceptIds: conceptIdsByByte.get(b.id) ?? [],
  }))
  const userEdges = await db.select().from(edges)
    .where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId)))
    .orderBy(asc(edges.createdAt), asc(edges.id))
  const clothRows = await db.select().from(cloths)
    .where(and(eq(cloths.userId, userId), inCourse(cloths.courseId, courseId)))
    .orderBy(asc(cloths.createdAt), asc(cloths.id))
  const userMaps = await db.select().from(maps)
    .where(and(eq(maps.userId, userId), inCourse(maps.courseId, courseId)))
    .orderBy(asc(maps.createdAt), asc(maps.id))
  const viewRows = await db.select().from(views)
    .where(and(
      eq(views.userId, userId),
      inCourse(views.courseId, courseId),
      or(eq(views.key, "cardTable"), like(views.key, "map:%"))
    ))

  const mapIds = new Set(userMaps.map((m) => m.id))
  const loomViews: LoomViews = { cardTable: { positions: {}, bends: {} } }
  viewRows.forEach((row) => {
    // Self-healing read: geometry for a map that no longer exists stays out of
    // the state rather than accumulating as an unreachable key.
    if (row.key !== "cardTable" && !mapIds.has(row.key.slice("map:".length))) return
    const data = (row.data ?? {}) as Partial<CardTableView>
    loomViews[row.key] = {
      positions: data.positions ?? {},
      bends: data.bends ?? {},
      ...(data.order ? { order: data.order } : {}),
      ...(data.pins ? { pins: data.pins } : {}),
    }
  })

  return {
    concepts: userConcepts,
    bytes: userBytes,
    edges: userEdges,
    maps: userMaps as LoomMap[],
    cloths: clothRows,
    views: loomViews,
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

export async function updateConcept(id: string, data: Partial<{ label: string, def: string, note: string }>) {
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
    const kind = data.label !== undefined ? "concept.rename" : "concept.update"
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
    await pruneViews(userId, courseId, { positions: [id], order: [id], pins: [id], tiers: [id] })
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

export async function createByte(data: { conceptIds?: string[], source: string, sourceId?: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, pageContentHash?: string, note?: string, question?: string, isPullQuote?: boolean, tier?: PassageTier }) {
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
      // Search the browser's string, not the stored one. `data.content` is a
      // selection taken off the rendered text layer, so it can only ever be
      // found in the text as the browser assembled it — stored page text now
      // also carries the line boundaries pdf.js marks, which appear nowhere in
      // a client capture.
      //
      // This was already the shape of a live bug: `content` comes from
      // `selection.toString()`, which carries a newline per rendered line,
      // while the offsets beside it come from `range.toString()`, which does
      // not. Every multi-line capture therefore failed this lookup and fell
      // through to the client-offset branch below.
      const canonicalIndex = findClosestTextIndex(
        textLayerProjection(page.textContent),
        data.content,
        data.startOffset
      )
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

  // Own the concepts before pointing at them — server actions are directly
  // POSTable, so this is the backstop, not a formality.
  const conceptIds = [...new Set(data.conceptIds ?? [])]
  if (conceptIds.length) {
    const owned = new Set(
      (await db.select({ id: concepts.id }).from(concepts)
        .where(and(inArray(concepts.id, conceptIds), eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
      ).map((r) => r.id)
    )
    if (owned.size !== conceptIds.length) throw new Error("Concept not found.")
  }

  // The byte and its concept pointers land in one batch: zero pointers is a
  // legal capture (an Unlabeled Passage), a half-written pointer set is not.
  // Server actions are directly POSTable, so the enum-ish fields are
  // sanitized rather than trusted; pointer createdAt is staggered because
  // filing order is meaning and same-statement rows would tie.
  const tier: PassageTier = data.tier === "p" || data.tier === "s" || data.tier === "t" ? data.tier : ""
  const byteId = crypto.randomUUID()
  const pointerBase = Date.now()
  const byteInsert = db.insert(bytes).values({
    id: byteId,
    courseId,
    userId,
    source: data.source,
    sourceId: data.sourceId,
    location: data.location,
    content: data.content,
    pageNumber: data.pageNumber,
    startOffset,
    endOffset,
    pageContentHash,
    note: typeof data.note === "string" ? data.note : "",
    question: typeof data.question === "string" ? data.question : "",
    isPullQuote: data.isPullQuote === true,
    tier,
  }).returning()
  const [inserted] = conceptIds.length
    ? (await db.batch([
        byteInsert,
        db.insert(byteConcepts).values(conceptIds.map((conceptId, i) => ({ byteId, conceptId, createdAt: new Date(pointerBase + i) }))),
      ]))[0]
    : await byteInsert

  // byte.capture fires for every capture, named or not — the Log is complete
  // (JC Aug 7 / P0.6). byte.create remains only as a historical kind.
  await recordEvent(userId, courseId, "byte.capture", "byte", byteId, {
    conceptIds,
    source: data.source,
    location: data.location,
  })
  return { ...inserted, conceptIds }
}

/**
 * File a passage under another concept (spec §3 Open; red line #2 names
 * re-file as permitted capture automation). Ruling 37 semantics: the byte
 * gains a pointer — one passage, several concepts, no row copies. The
 * passage's anchor and margin stay singular.
 */
export async function refileByte(byteId: string, conceptId: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const rows = await db.select().from(bytes)
    .where(and(eq(bytes.id, byteId), eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
    .limit(1)
  const src = rows[0]
  if (!src) throw new Error("Byte not found.")

  const owned = await db.select({ id: concepts.id }).from(concepts)
    .where(and(eq(concepts.id, conceptId), eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
    .limit(1)
  if (!owned.length) throw new Error("Concept not found.")

  const existing = await db.select({ conceptId: byteConcepts.conceptId }).from(byteConcepts)
    .where(eq(byteConcepts.byteId, byteId))
    .orderBy(asc(byteConcepts.createdAt), asc(byteConcepts.conceptId))
  if (existing.some((r) => r.conceptId === conceptId)) {
    throw new Error("Already filed under that concept.")
  }

  await db.insert(byteConcepts).values({ byteId, conceptId })

  await recordEvent(userId, courseId, "byte.refile", "byte", byteId, {
    conceptId,
    source: src.source,
  })
  return { ...src, conceptIds: [...existing.map((r) => r.conceptId), conceptId] }
}

/**
 * Remove one concept pointer from a passage — refileByte's inverse; the
 * pointer model needs both directions. The byte itself is untouched: with no
 * pointers left it is an Unlabeled Passage, not gone.
 */
export async function unfileByte(byteId: string, conceptId: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const rows = await db.select({ id: bytes.id }).from(bytes)
    .where(and(eq(bytes.id, byteId), eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
    .limit(1)
  if (!rows.length) throw new Error("Byte not found.")

  const removed = await db.delete(byteConcepts)
    .where(and(eq(byteConcepts.byteId, byteId), eq(byteConcepts.conceptId, conceptId)))
    .returning({ conceptId: byteConcepts.conceptId })
  if (removed.length > 0) {
    await recordEvent(userId, courseId, "byte.unfile", "byte", byteId, { conceptId })
  }
}

/**
 * Say which reading a passage came from.
 *
 * Bytes captured before reading-first, and any captured outside a reading,
 * carry free-text `source` and no `sourceId`, so they have no door and fall out
 * of every lens. This is the way back in — and it is the STUDENT saying it.
 * Matching `byte.source` text against library titles would be the tool deciding
 * what they meant, which is exactly the judgment red line #2 keeps out of the
 * machine's hands.
 */
export async function attributeBytes(byteIds: string[], sourceId: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)
  if (!byteIds.length) return 0

  // Not merely "does this id exist" — that admitted any reading in the
  // library, including another student's private upload, letting one learner
  // file their passages against a reading they were never entitled to see and
  // pulling that reading's title into their own graph and exports. The check is
  // the same one that guards the file itself.
  await authorizeSourceAccess(sourceId)

  const updated = await db.update(bytes).set({ sourceId })
    .where(and(
      inArray(bytes.id, byteIds),
      eq(bytes.userId, userId),
      inCourse(bytes.courseId, courseId),
      isNull(bytes.sourceId)
    ))
    .returning({ id: bytes.id })

  if (updated.length) {
    await recordEvent(userId, courseId, "byte.attribute", "byte", null, {
      sourceId,
      count: updated.length,
    })
  }
  return updated.length
}

export async function deleteByte(id: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  // Read the pointers first: the join rows cascade with the byte, and the
  // event should say what the passage was filed under when it went.
  const pointers = await db.select({ conceptId: byteConcepts.conceptId }).from(byteConcepts)
    .where(eq(byteConcepts.byteId, id))
  const removed = await db.delete(bytes)
    .where(and(eq(bytes.id, id), eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
    .returning({ id: bytes.id })
  if (removed.length > 0) {
    await recordEvent(userId, courseId, "byte.delete", "byte", id, {
      conceptIds: pointers.map((r) => r.conceptId),
    })
  }
}

export async function createEdge(data: { fromId: string, toId: string, sentence?: string }) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  // A link is creatable before its description (P0.3) — the golden path
  // connects concepts first; the sentence is encouraged, never required.
  const sentence = data.sentence ?? ""
  const newEdge = await db.insert(edges).values({
    courseId,
    userId,
    fromId: data.fromId,
    toId: data.toId,
    sentence,
  }).returning()

  await recordEvent(userId, courseId, "edge.throw", "edge", newEdge[0].id, {
    fromId: data.fromId,
    toId: data.toId,
    sentence,
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
    await pruneViews(userId, courseId, { bends: [id] })
  }
}

/**
 * Title or describe a cloth — the per-scope workspace identity (P0.4). One
 * upsert per scope: the whole weave is scopeKey '', a reading its sourceId.
 * Replaces the retired `saveRead` (the read paragraph became the whole-weave
 * cloth's description in 0021).
 */
export async function saveCloth(data: { scopeKey: string; title?: string; description?: string }) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const scopeKey = scopeFromKey(data.scopeKey).key
  const title = data.title === undefined ? undefined : data.title.trim().slice(0, 200)
  const set: Partial<typeof cloths.$inferInsert> = { updatedAt: new Date() }
  if (title !== undefined) set.title = title
  if (data.description !== undefined) set.description = data.description

  const [row] = await db.insert(cloths).values({
    userId,
    courseId,
    scopeKey,
    title: title ?? "",
    description: data.description ?? "",
  }).onConflictDoUpdate({
    target: [cloths.userId, cloths.courseId, cloths.scopeKey],
    set,
  }).returning()

  await recordEvent(userId, courseId, "cloth.update", "cloth", row.id, {
    scopeKey,
    ...(title !== undefined ? { titleChars: title.length } : {}),
    ...(data.description !== undefined ? { descriptionChars: data.description.length } : {}),
  })
  return row
}

// --- MAPS ---
// A map is one named sorting of the concepts within a scope, with its own
// paragraph and essence sentence. Parallel siblings, freely made and unmade.
// Tiers live here and only here — the concept.tier / read-row mirror was
// dropped in 0021 (P0.5); the maps table is the single source of truth.

const STORED_TIERS = ["p", "s", "t", "x"] as const
type StoredTier = (typeof STORED_TIERS)[number]
const MAX_MAPS = 60

/** Keep only known concepts with a stored (non-'') tier — absent = unsorted. */
function sanitizeTiers(
  raw: Record<string, Tier>,
  knownConceptIds: Set<string>
): Record<string, StoredTier> {
  const out: Record<string, StoredTier> = {}
  Object.entries(raw).forEach(([conceptId, tier]) => {
    if (!knownConceptIds.has(conceptId)) return
    if ((STORED_TIERS as readonly string[]).includes(tier)) out[conceptId] = tier as StoredTier
  })
  return out
}

export async function createMap(data: { scopeKey: string; name: string }): Promise<LoomMap> {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const existing = await db.select({ id: maps.id }).from(maps)
    .where(and(eq(maps.userId, userId), inCourse(maps.courseId, courseId)))
  if (existing.length >= MAX_MAPS) {
    throw new Error("That is a lot of maps — delete one you are done with first.")
  }

  const scopeKey = scopeFromKey(data.scopeKey).key
  const name = data.name.trim().slice(0, 80) || "Map"

  const inserted = await db.insert(maps).values({ courseId, userId, scopeKey, name }).returning()
  await recordEvent(userId, courseId, "map.create", "map", inserted[0].id, { name, scopeKey })
  return inserted[0] as LoomMap
}

export async function updateMap(
  id: string,
  data: Partial<{ name: string; read: string; essence: string; tiers: Record<string, Tier> }>
) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const rows = await db.select().from(maps)
    .where(and(eq(maps.id, id), eq(maps.userId, userId), inCourse(maps.courseId, courseId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw new Error("Map not found.")

  const set: Partial<typeof maps.$inferInsert> = { updatedAt: new Date() }
  if (data.name !== undefined) set.name = data.name.trim().slice(0, 80) || row.name
  if (data.read !== undefined) set.read = data.read
  if (data.essence !== undefined) set.essence = data.essence

  // Tiers arrive as the whole object (so "make all primary" is one write); the
  // server diffs against the stored row so the event records what changed —
  // including scopeKey and mapId, the record NEXT_SESSION's trap (b) demands.
  let changed: Record<string, Tier> | undefined
  if (data.tiers !== undefined) {
    const known = new Set(
      (await db.select({ id: concepts.id }).from(concepts)
        .where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))).map((r) => r.id)
    )
    const nextTiers = sanitizeTiers(data.tiers, known)
    changed = {}
    Object.entries(nextTiers).forEach(([cid, tier]) => {
      if (row.tiers[cid] !== tier) changed![cid] = tier
    })
    Object.keys(row.tiers).forEach((cid) => {
      if (!(cid in nextTiers)) changed![cid] = ""
    })
    set.tiers = nextTiers
  }

  await db.update(maps).set(set)
    .where(and(eq(maps.id, id), eq(maps.userId, userId), inCourse(maps.courseId, courseId)))

  const kind =
    data.tiers !== undefined ? "map.retier" :
    data.name !== undefined ? "map.rename" :
    "map.update"
  const payload: Record<string, unknown> = { scopeKey: row.scopeKey }
  if (kind === "map.retier") payload.changed = changed
  if (kind === "map.rename") payload.name = set.name
  if (kind === "map.update") {
    if (data.read !== undefined) payload.readChars = data.read.length
    if (data.essence !== undefined) payload.essenceChars = data.essence.length
  }
  await recordEvent(userId, courseId, kind, "map", id, payload)
}

export async function deleteMap(id: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const rows = await db.select().from(maps)
    .where(and(eq(maps.id, id), eq(maps.userId, userId), inCourse(maps.courseId, courseId)))
    .limit(1)
  const row = rows[0]
  if (!row) return

  await db.batch([
    db.delete(maps).where(and(eq(maps.id, id), eq(maps.userId, userId), inCourse(maps.courseId, courseId))),
    db.delete(views).where(and(eq(views.userId, userId), inCourse(views.courseId, courseId), eq(views.key, `map:${id}`))),
  ])
  await recordEvent(userId, courseId, "map.delete", "map", id, { scopeKey: row.scopeKey, name: row.name })
}

/**
 * Persist student-authored view geometry (spec §6 `views`). Only student
 * gestures reach this — derived auto-layout must be computed for display and
 * discarded, never saved (red line #7). No history event: views are
 * projections of the graph, not part of its development.
 *
 * Accepts the legacy `cardTable` key or `map:<id>` for a map the caller owns —
 * server functions are directly POSTable, so the ownership check is the
 * backstop against writing arbitrary view rows.
 */
export async function saveView(key: string, data: CardTableView) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  if (key !== "cardTable") {
    const match = /^map:(.+)$/.exec(key)
    if (!match) throw new Error("Unknown view key.")
    const owned = await db.select({ id: maps.id }).from(maps)
      .where(and(eq(maps.id, match[1]), eq(maps.userId, userId), inCourse(maps.courseId, courseId)))
      .limit(1)
    if (!owned.length) throw new Error("Unknown view key.")
  }

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
      .filter((e) => e.kind.endsWith(".create") || e.kind === "byte.capture" || e.kind === "edge.throw" || e.kind === "byte.refile")
      .map((e) => e.entityId)
  )
  // Rows born inside an import/example land in that event's snapshot; don't
  // also synthesize creates for them or they'd replay twice.
  recorded
    .filter((e) => e.kind === "graph.import" || e.kind === "graph.example")
    .forEach((e) => {
      const snapshot = (e.payload as { snapshot?: { concepts?: { id: string }[]; bytes?: { id: string }[]; edges?: { id: string }[]; maps?: { id: string }[] } } | null)?.snapshot
      snapshot?.concepts?.forEach((c) => covered.add(c.id))
      snapshot?.bytes?.forEach((b) => covered.add(b.id))
      snapshot?.edges?.forEach((ed) => covered.add(ed.id))
      snapshot?.maps?.forEach((m) => covered.add(m.id))
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
      entityId: c.id, payload: { label: c.label, synthesized: true }, at: c.createdAt,
    })
  )
  userBytes.filter((b) => !covered.has(b.id)).forEach((b) =>
    synthesized.push({
      id: `synth-b-${b.id}`, userId, courseId, kind: "byte.create", entityType: "byte",
      entityId: b.id, payload: { source: b.source, synthesized: true }, at: b.createdAt,
    })
  )
  userEdges.filter((e) => !covered.has(e.id)).forEach((e) =>
    synthesized.push({
      id: `synth-e-${e.id}`, userId, courseId, kind: "edge.throw", entityType: "edge",
      entityId: e.id, payload: { fromId: e.fromId, toId: e.toId, sentence: e.sentence, synthesized: true }, at: e.createdAt,
    })
  )

  // Maps born before event recording (the 0012 backfill) get a synthesized
  // start too, so the timeline names them honestly.
  const userMaps = await db.select().from(maps)
    .where(and(eq(maps.userId, userId), inCourse(maps.courseId, courseId)))
    .orderBy(asc(maps.createdAt), asc(maps.id))
  userMaps.filter((m) => !covered.has(m.id)).forEach((m) =>
    synthesized.push({
      id: `synth-m-${m.id}`, userId, courseId, kind: "map.create", entityType: "map",
      entityId: m.id, payload: { name: m.name, scopeKey: m.scopeKey, synthesized: true }, at: m.createdAt,
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
    maps: (await db.select({ id: maps.id }).from(maps).where(and(eq(maps.userId, userId), inCourse(maps.courseId, courseId)))).length,
  }
  await recordEvent(userId, courseId, "graph.reset", "graph", null, counts)

  await db.batch([
    db.delete(edges).where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId))),
    db.delete(bytes).where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId))),
    db.delete(concepts).where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId))),
    db.delete(maps).where(and(eq(maps.userId, userId), inCourse(maps.courseId, courseId))),
    db.delete(cloths).where(and(eq(cloths.userId, userId), inCourse(cloths.courseId, courseId))),
    db.delete(views).where(and(eq(views.userId, userId), inCourse(views.courseId, courseId))),
  ])
}

const IMPORT_LIMITS = { concepts: 400, bytes: 2000, edges: 2000, maps: 40, cloths: 40 }

type GraphSnapshot = {
  concepts: { id: string; label: string }[]
  bytes: { id: string; conceptIds: string[] }[]
  edges: { id: string; fromId: string; toId: string; sentence: string; handle: string }[]
  maps?: { id: string; name: string; scopeKey: string }[]
  cloths?: { id: string; scopeKey: string; title: string }[]
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
      parsed.edges.length > IMPORT_LIMITS.edges ||
      parsed.maps.length > IMPORT_LIMITS.maps ||
      parsed.cloths.length > IMPORT_LIMITS.cloths) {
    throw new Error("That export is larger than an import will accept.")
  }

  // Imported anchors, map scopes and cloth scopes may point at readings this
  // deployment doesn't have; only keep sourceIds that actually resolve.
  const anchorIds = [...new Set(parsed.bytes.map((b) => b.anchor?.sourceId).filter((v): v is string => !!v))]
  const scopeSourceIds = [...new Set([
    ...parsed.maps.flatMap((m) => (m.scopeKey ? m.scopeKey.split(",") : [])),
    ...parsed.cloths.flatMap((c) => (c.scopeKey ? c.scopeKey.split(",") : [])),
  ])]
  const referencedSourceIds = [...new Set([...anchorIds, ...scopeSourceIds])]
  const knownSources = referencedSourceIds.length
    ? new Set((await db.select({ id: sources.id }).from(sources).where(inArray(sources.id, referencedSourceIds))).map((r) => r.id))
    : new Set<string>()

  // Remint every id up front so the rows, the view remap, and the history
  // snapshot all agree before anything touches the database.
  const conceptIdByKey = new Map(parsed.concepts.map((c) => [c.key, crypto.randomUUID()]))
  const edgeIdByKey = new Map<string, string>()

  const conceptRows = parsed.concepts.map((c) => ({
    id: conceptIdByKey.get(c.key)!,
    courseId, userId, label: c.label, def: c.def, note: c.note,
  }))
  // Every byte survives — a passage whose concept keys don't resolve arrives
  // as an Unlabeled Passage rather than being dropped (red line #5). Pointer
  // createdAt is staggered per row: filing order is meaning, and rows born in
  // one statement would otherwise tie and come back in reminted-UUID order.
  const pointerBase = Date.now()
  let pointerSeq = 0
  const byteConceptRows: { byteId: string; conceptId: string; createdAt: Date }[] = []
  const byteRows = parsed.bytes.map((b) => {
    const id = crypto.randomUUID()
    b.conceptKeys.forEach((key) => {
      const conceptId = conceptIdByKey.get(key)
      if (conceptId) byteConceptRows.push({ byteId: id, conceptId, createdAt: new Date(pointerBase + pointerSeq++) })
    })
    const anchor = b.anchor && knownSources.has(b.anchor.sourceId) ? b.anchor : undefined
    return {
      id,
      courseId, userId,
      source: b.source, location: b.location, content: b.text,
      sourceId: anchor?.sourceId,
      pageNumber: anchor?.pageNumber ?? undefined,
      startOffset: anchor?.startOffset ?? undefined,
      endOffset: anchor?.endOffset ?? undefined,
      pageContentHash: anchor?.pageContentHash ?? undefined,
      note: b.note ?? "",
      question: b.question ?? "",
      isPullQuote: b.isPullQuote ?? false,
      tier: b.tier ?? ("" as PassageTier),
    }
  })
  const conceptIdsByByte = new Map<string, string[]>()
  byteConceptRows.forEach((r) => {
    const list = conceptIdsByByte.get(r.byteId) ?? []
    list.push(r.conceptId)
    conceptIdsByByte.set(r.byteId, list)
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

  // Remap a parsed view's keys onto the minted ids — trap (c)'s geometry half.
  const remapView = (view: CardTableView): CardTableView => {
    const positions: CardTableView["positions"] = {}
    Object.entries(view.positions).forEach(([key, p]) => {
      const id = conceptIdByKey.get(key)
      if (id) positions[id] = p
    })
    const bends: CardTableView["bends"] = {}
    Object.entries(view.bends).forEach(([key, b]) => {
      const id = edgeIdByKey.get(key)
      if (id) bends[id] = b
    })
    const order = (view.order ?? [])
      .map((key) => conceptIdByKey.get(key))
      .filter((id): id is string => !!id)
    const pins = (view.pins ?? [])
      .map((key) => conceptIdByKey.get(key))
      .filter((id): id is string => !!id)
    return { positions, bends, order, pins }
  }
  const hasGeometry = (v: CardTableView) =>
    Object.keys(v.positions).length > 0 || Object.keys(v.bends).length > 0 || (v.order?.length ?? 0) > 0 || (v.pins?.length ?? 0) > 0

  const cardTable = remapView(parsed.cardTable)

  // Maps: remint ids, remap tier keys through conceptIdByKey (trap (c)), and
  // resolve each scopeKey against the readings this deployment holds. A scope
  // that resolves to nothing falls back to the whole weave rather than the map
  // being skipped — the student's tiers, essence and read stay reachable (red
  // line #5), which beats scope fidelity.
  const mapIdByKey = new Map(parsed.maps.map((m) => [m.key, crypto.randomUUID()]))
  const mapRows = parsed.maps.map((m) => {
    const surviving = m.scopeKey ? m.scopeKey.split(",").filter((id) => knownSources.has(id)) : []
    const tiers: Record<string, "p" | "s" | "t" | "x"> = {}
    Object.entries(m.tiers).forEach(([key, tier]) => {
      const cid = conceptIdByKey.get(key)
      if (cid && tier) tiers[cid] = tier
    })
    return {
      id: mapIdByKey.get(m.key)!,
      courseId, userId,
      scopeKey: scopeOf(surviving).key,
      name: m.name, essence: m.essence, read: m.read,
      tiers,
    }
  })
  const mapViewRows = Object.entries(parsed.mapViews).flatMap(([mapKey, view]) => {
    const mapId = mapIdByKey.get(mapKey)
    if (!mapId) return []
    const remapped = remapView(view)
    return hasGeometry(remapped)
      ? [{ userId, courseId, key: `map:${mapId}`, data: remapped as Record<string, unknown> }]
      : []
  })

  // Cloths: resolve each scope against this deployment's readings, same
  // whole-weave fallback as maps. Exact scopes claim their slots FIRST: a
  // reading cloth whose sources don't resolve degrades toward the whole
  // weave, and it must never evict the student's genuine whole-weave cloth
  // — that is the read paragraph red line #5 exists to protect. On a
  // collision the degraded cloth is dropped, not the genuine one.
  const resolvedCloths = parsed.cloths.map((c) => {
    const ids = c.scopeKey ? c.scopeKey.split(",") : []
    const surviving = ids.filter((id) => knownSources.has(id))
    return { c, scopeKey: scopeOf(surviving).key, degraded: surviving.length !== ids.length }
  })
  const seenClothScopes = new Set<string>()
  const clothRows: { id: string; courseId: string | null; userId: string; scopeKey: string; title: string; description: string }[] = []
  const addCloth = ({ c, scopeKey }: (typeof resolvedCloths)[number]) => {
    if (seenClothScopes.has(scopeKey)) return
    seenClothScopes.add(scopeKey)
    clothRows.push({
      id: crypto.randomUUID(),
      courseId, userId, scopeKey,
      title: c.title, description: c.description,
    })
  }
  resolvedCloths.filter((r) => !r.degraded).forEach(addCloth)
  resolvedCloths.filter((r) => r.degraded).forEach(addCloth)

  const snapshot: GraphSnapshot = {
    concepts: conceptRows.map((c) => ({ id: c.id, label: c.label })),
    bytes: byteRows.map((b) => ({ id: b.id, conceptIds: conceptIdsByByte.get(b.id) ?? [] })),
    edges: edgeRows.map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId, sentence: e.sentence, handle: e.handle })),
    maps: mapRows.map((m) => ({ id: m.id, name: m.name, scopeKey: m.scopeKey })),
    cloths: clothRows.map((c) => ({ id: c.id, scopeKey: c.scopeKey, title: c.title })),
  }
  await recordEvent(userId, courseId, "graph.import", "graph", null, {
    concepts: conceptRows.length,
    bytes: byteRows.length,
    edges: edgeRows.length,
    maps: mapRows.length,
    cloths: clothRows.length,
    snapshot,
  })

  const statements = [
    db.delete(edges).where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId))),
    db.delete(bytes).where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId))),
    db.delete(concepts).where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId))),
    db.delete(maps).where(and(eq(maps.userId, userId), inCourse(maps.courseId, courseId))),
    db.delete(cloths).where(and(eq(cloths.userId, userId), inCourse(cloths.courseId, courseId))),
    db.delete(views).where(and(eq(views.userId, userId), inCourse(views.courseId, courseId))),
    ...(conceptRows.length ? [db.insert(concepts).values(conceptRows)] : []),
    ...(byteRows.length ? [db.insert(bytes).values(byteRows)] : []),
    ...(byteConceptRows.length ? [db.insert(byteConcepts).values(byteConceptRows)] : []),
    ...(edgeRows.length ? [db.insert(edges).values(edgeRows)] : []),
    ...(mapRows.length ? [db.insert(maps).values(mapRows)] : []),
    ...(clothRows.length ? [db.insert(cloths).values(clothRows)] : []),
    ...(hasGeometry(cardTable)
      ? [db.insert(views).values({ userId, courseId, key: "cardTable", data: cardTable as Record<string, unknown> })]
      : []),
    ...(mapViewRows.length ? [db.insert(views).values(mapViewRows)] : []),
  ]
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  return getUserLoomData()
}

/**
 * Bring one map file back in (ratified TJ 2026-07-31: maps are the primary
 * keepable artifact, so a map file must round-trip). Deliberately narrower
 * than importGraph: the map RESTORES AN ARRANGEMENT onto the cards still on
 * this table, matched by concept id — tiers and geometry survive where the id
 * resolves, and are counted where it does not. It never re-weaves missing
 * cards (the whole-cloth .json does that) and never replaces anything: the
 * map arrives as one more parallel sibling.
 */
export async function importMapArrangement(parsed: ParsedMapImport) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  if (Object.keys(parsed.map.tiers).length > IMPORT_LIMITS.concepts) {
    throw new Error("That map file is larger than an import will accept.")
  }

  const [conceptRows, edgeRows] = await Promise.all([
    db.select({ id: concepts.id }).from(concepts)
      .where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId))),
    db.select({ id: edges.id }).from(edges)
      .where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId))),
  ])
  const knownConcepts = new Set(conceptRows.map((r) => r.id))
  const knownEdges = new Set(edgeRows.map((r) => r.id))

  const tiers: Record<string, "p" | "s" | "t" | "x"> = {}
  Object.entries(parsed.map.tiers).forEach(([id, tier]) => {
    if (knownConcepts.has(id) && tier) tiers[id] = tier
  })
  const skipped = Object.keys(parsed.map.tiers).length - Object.keys(tiers).length

  // Resolve the scope against the readings this deployment holds, falling back
  // to the whole weave — same rule as importGraph, for the same reason: the
  // student's tiers, essence and read stay reachable (red line #5).
  const scopeIds = parsed.map.scopeKey ? parsed.map.scopeKey.split(",") : []
  const knownScope = scopeIds.length
    ? new Set((await db.select({ id: sources.id }).from(sources).where(inArray(sources.id, scopeIds))).map((r) => r.id))
    : new Set<string>()
  const scopeKey = scopeOf(scopeIds.filter((id) => knownScope.has(id))).key

  const [mapRow] = await db.insert(maps).values({
    courseId,
    userId,
    scopeKey,
    name: parsed.map.name,
    essence: parsed.map.essence,
    read: parsed.map.read,
    tiers,
  }).returning()

  const positions: CardTableView["positions"] = {}
  Object.entries(parsed.view.positions).forEach(([id, p]) => {
    if (knownConcepts.has(id)) positions[id] = p
  })
  const bends: CardTableView["bends"] = {}
  Object.entries(parsed.view.bends).forEach(([id, b]) => {
    if (knownEdges.has(id)) bends[id] = b
  })
  const order = (parsed.view.order ?? []).filter((id) => knownConcepts.has(id))
  const pins = (parsed.view.pins ?? []).filter((id) => knownConcepts.has(id))
  if (Object.keys(positions).length || Object.keys(bends).length || order.length || pins.length) {
    await db.insert(views).values({
      userId,
      courseId,
      key: `map:${mapRow.id}`,
      data: { positions, bends, order, pins } as Record<string, unknown>,
    })
  }

  await recordEvent(userId, courseId, "map.import", "map", mapRow.id, {
    name: mapRow.name,
    scopeKey,
    tiers: Object.keys(tiers).length,
    skipped,
  })

  const data = await getUserLoomData()
  return { data, mapId: mapRow.id, scopeKey, skipped }
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

  // The example needs a door: reading-first places a byte by its sourceId, so
  // without a card of its own the whole example would sit outside every reading
  // and the shelf would look empty next to a full loom. Reused rather than
  // re-minted, since reset clears the cloth but not this card.
  const existingCard = await db.select({ id: sources.id }).from(sources)
    .where(and(
      eq(sources.isOwn, true),
      eq(sources.createdByUserId, userId),
      eq(sources.title, WORKED_EXAMPLE_SOURCE.title)
    ))
    .limit(1)
  const exampleSourceId = existingCard[0]?.id ?? (
    await db.insert(sources).values({
      ...WORKED_EXAMPLE_SOURCE,
      description: "",
      isDescriptionVisible: false,
      isOwn: true,
      storageKey: null,
      createdByUserId: userId,
    }).returning({ id: sources.id })
  )[0].id

  const conceptIdByKey = new Map(WORKED_EXAMPLE.concepts.map((c) => [c.key, crypto.randomUUID()]))
  const conceptRows = WORKED_EXAMPLE.concepts.map((c) => ({
    id: conceptIdByKey.get(c.key)!,
    courseId, userId, label: c.label, def: c.def, note: c.note,
  }))
  const byteConceptRows: { byteId: string; conceptId: string }[] = []
  const byteRows = WORKED_EXAMPLE.bytes
    .filter((b) => conceptIdByKey.has(b.conceptKey))
    .map((b) => {
      const id = crypto.randomUUID()
      byteConceptRows.push({ byteId: id, conceptId: conceptIdByKey.get(b.conceptKey)! })
      return {
        id,
        courseId, userId,
        source: b.source, sourceId: exampleSourceId, location: b.location, content: b.text,
      }
    })
  const edgeRows = WORKED_EXAMPLE.edges
    .filter((e) => conceptIdByKey.has(e.fromKey) && conceptIdByKey.has(e.toKey))
    .map((e) => ({
      id: crypto.randomUUID(),
      courseId, userId,
      fromId: conceptIdByKey.get(e.fromKey)!,
      toId: conceptIdByKey.get(e.toKey)!,
      sentence: e.sentence, handle: e.handle,
    }))

  const byteConceptIds = new Map(byteConceptRows.map((r) => [r.byteId, [r.conceptId]]))
  const snapshot: GraphSnapshot = {
    concepts: conceptRows.map((c) => ({ id: c.id, label: c.label })),
    bytes: byteRows.map((b) => ({ id: b.id, conceptIds: byteConceptIds.get(b.id) ?? [] })),
    edges: edgeRows.map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId, sentence: e.sentence, handle: e.handle })),
  }
  await recordEvent(userId, courseId, "graph.example", "graph", null, {
    title: WORKED_EXAMPLE.title,
    snapshot,
  })

  // The example's whole-weave map, tiered from the example's own sorting —
  // per-map tiers are the only tiers there are (P0.5).
  const exampleTiers: Record<string, StoredTier> = {}
  WORKED_EXAMPLE.concepts.forEach((c) => {
    if (c.tier) exampleTiers[conceptIdByKey.get(c.key)!] = c.tier
  })

  await db.batch([
    db.insert(concepts).values(conceptRows),
    db.insert(bytes).values(byteRows),
    db.insert(byteConcepts).values(byteConceptRows),
    db.insert(edges).values(edgeRows),
    db.insert(maps).values({ courseId, userId, scopeKey: "", name: "Map 1", read: WORKED_EXAMPLE.read, essence: "", tiers: exampleTiers }),
  ])

  return getUserLoomData()
}
