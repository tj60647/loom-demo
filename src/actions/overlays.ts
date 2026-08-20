"use server"

/**
 * Overlays — the read-only comparison of a section's marks with the cohort's
 * (docs/loom-model-build.md §2 "Overlays"; refactor spec P3.14, ruling 28).
 * The aggregate side lives at `/admin/aggregate`; this is the in-reading side,
 * deliberately narrower — and it is staff-only too (decision 0 below): the
 * viewer's own marks are never a band, and students never meet these at all.
 *
 * The decisions wired here and nowhere else:
 *
 * 1. THE GATE, PER READING — RETIRED 2026-08-08 with the student overlays.
 *    The archived spec's red line #8 ("the crowd must not pre-code the text")
 *    gated an overlay on the viewer having captured in that reading first; it
 *    protected a *student's* first read, and there is no student viewer left.
 *    Scope is now the peers' coded readings (see below), and no capture check
 *    remains in this file.
 * 2. SECTION AND COHORT ONLY. No per-person band ships in v1, so nothing here
 *    returns a name, an id, or anything that resolves to one. Counts are of
 *    PEOPLE, never of rows that carry an author.
 * 3. SHARED OBJECTS ONLY. Highlight spans, Concept Labels and Descriptions,
 *    Link Labels and Descriptions. Never Notes, Questions, Pull-quote flags,
 *    Passage Tiers, Cloth Titles/Descriptions or Projection text — the margin
 *    and the interpretation stay the student's own. The passage QUERY below
 *    does not select `content`: an overlay says where people marked, not what
 *    they kept.
 * 4. FACULTY ARE NOT PEERS. Excluded from both bands: an exemplar cloth read
 *    as "your cohort" would be the instructor pre-coding the text, which is
 *    the thing the gate exists to prevent.
 *
 * Auth is a real session every time — no dev backdoor, unlike
 * `src/actions/loom.ts`. These read other people's work, so impersonating a
 * seed user to see it is not a convenience this file offers.
 */

import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm"
import { getServerSession } from "next-auth/next"

import { db } from "@/db"
import { passages, passageConcepts, concepts, courseMemberships, edges, sourcePages } from "@/db/schema"
import { authOptions, isAdminUser } from "@/lib/auth"
import { resolveCourseIdForUser } from "@/lib/courses"
import {
  emptyPassagesOverlay,
  emptyVocabularyOverlay,
  groupTerms,
  heatSpans,
  type Interval,
  type OverlayBand,
  type OverlayBlock,
  type PageHeat,
  type PassagesOverlay,
  type VocabularyOverlay,
} from "@/lib/overlay"

/**
 * The most heat spans one reading's overlay may carry. A span is emitted per
 * change in depth, so this is only reachable on a heavily-marked long text;
 * whatever it cuts is reported as `droppedSpans` rather than vanishing.
 */
const MAX_SPANS = 4000

/**
 * Above this many in-scope concepts the edge query stops naming them and
 * filters in memory instead — a WHERE IN with thousands of ids is a worse
 * shape than the extra rows it saves, and the whole weave reaches that size.
 */
const EDGE_PUSHDOWN_LIMIT = 800

type Viewer = { userId: string; courseId: string; sectionId: string | null }
type Blocked = { blocked: OverlayBlock }

const isBlocked = (value: unknown): value is Blocked =>
  typeof value === "object" && value !== null && "blocked" in value

/** Who is comparing, and the course whose cohort they are part of. */
async function overlayViewer(): Promise<Viewer | Blocked> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return { blocked: "signed-out" }

  const courseId = await resolveCourseIdForUser(userId)
  if (!courseId) return { blocked: "not-enrolled" }

  const rows = await db
    .select({ sectionId: courseMemberships.sectionId, role: courseMemberships.role })
    .from(courseMemberships)
    .where(
      and(
        eq(courseMemberships.courseId, courseId),
        eq(courseMemberships.userId, userId),
        isNull(courseMemberships.removedAt)
      )
    )
    .limit(1)

  // An admin walking the learner surfaces resolves a course without being on
  // its roster (resolveCourseIdForUser keeps that fallback for them). There is
  // no cohort they belong to, and inventing one would hand a section's work to
  // someone the section never enrolled.
  if (rows.length === 0) return { blocked: "not-enrolled" }

  // Decision 0 (TJ, 2026-08-08): overlays are a FACULTY and ADMIN capability.
  // Students never see them. Faculty arrive through their own learner
  // surfaces, which they hold alongside the faculty view — capabilities are
  // additive — so the control appears there for them and nowhere for a
  // student. Enforced here, so no page bug can widen it.
  const staff = isAdminUser(session.user) || rows[0].role === "FACULTY"
  if (!staff) return { blocked: "not-staff" }

  return { userId, courseId, sectionId: rows[0].sectionId }
}

/** The people this band compares you with — never you, never faculty. */
async function peersOf(
  viewer: Viewer,
  band: OverlayBand,
  /** Which section, when the viewer chose one. Staff pick any section of the
   *  course; without it this falls back to the viewer's own, which is what a
   *  section band meant before the picker (TJ, 2026-08-08). */
  sectionId?: string | null
): Promise<string[] | Blocked> {
  const section = sectionId ?? viewer.sectionId
  if (band === "section" && !section) return { blocked: "no-section" }

  const rows = await db
    .select({ userId: courseMemberships.userId })
    .from(courseMemberships)
    .where(
      and(
        eq(courseMemberships.courseId, viewer.courseId),
        isNull(courseMemberships.removedAt),
        ne(courseMemberships.userId, viewer.userId),
        // Peers are LEARNERS — stated positively, because stating it as
        // "not FACULTY" left a hole. `enrolInvitedCourses` writes
        // `INSTRUCTOR` for an admin who joins by invitation (auth.ts), and
        // INSTRUCTOR is not FACULTY, so an admin's own captures were being
        // counted as a peer in both bands — which is exactly decision 4 above,
        // in the words of the comment: "an exemplar cloth read as 'your
        // cohort' would be the instructor pre-coding the text". A positive
        // match cannot rot the same way when another role string appears.
        eq(courseMemberships.role, "LEARNER"),
        ...(band === "section" ? [eq(courseMemberships.sectionId, section!)] : [])
      )
    )

  return rows.map((row) => row.userId)
}

/** The readings a set of people have coded — the whole-weave comparison scope. */
async function codedBy(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []
  const rows = await db
    .selectDistinct({ sourceId: passages.sourceId })
    .from(passages)
    .where(and(inArray(passages.userId, userIds), isNotNull(passages.sourceId)))
  return rows.map((row) => row.sourceId).filter((id): id is string => !!id)
}

/**
 * Where other people marked this reading — the Passages Overlay of the Reading
 * tab (model §2, §3.2).
 *
 * Returns spans and counts, never text. A span shades only if the client's own
 * rendered text layer hashes to the same string the offsets were measured
 * against; the ones that cannot are still counted, as `unanchored`, because a
 * capture the tool cannot place is still a capture that happened.
 */
export async function getPassagesOverlay(
  sourceIdRaw: string,
  band: OverlayBand = "section",
  sectionId?: string | null
): Promise<PassagesOverlay> {
  const sourceId = (sourceIdRaw ?? "").trim()
  if (!sourceId) return emptyPassagesOverlay(band, "not-coded")

  const viewer = await overlayViewer()
  if (isBlocked(viewer)) return emptyPassagesOverlay(band, viewer.blocked)

  // The old per-reading capture gate is gone with the student overlays: it
  // existed so the crowd could not pre-code a student's reading, and there is
  // no student here to protect. An instructor seeing where a section marked is
  // the job (they already have /admin/aggregate, ungated).

  const peers = await peersOf(viewer, band, sectionId)
  if (isBlocked(peers)) return emptyPassagesOverlay(band, peers.blocked)
  if (peers.length === 0) return emptyPassagesOverlay(band, "no-peers")

  // No `content`, no `note`, no `question`, no `tier`, no `userId` beyond what
  // the contributor count needs — see decision 3 at the top of this file.
  const rows = await db
    .select({
      userId: passages.userId,
      pageNumber: passages.pageNumber,
      startOffset: passages.startOffset,
      endOffset: passages.endOffset,
      pageContentHash: passages.pageContentHash,
    })
    .from(passages)
    .where(and(eq(passages.sourceId, sourceId), inArray(passages.userId, peers)))

  const base = { ...emptyPassagesOverlay(band, null), peers: peers.length }
  if (rows.length === 0) return base

  const pageHashes = new Map(
    (
      await db
        .select({ pageNumber: sourcePages.pageNumber, contentHash: sourcePages.contentHash })
        .from(sourcePages)
        .where(eq(sourcePages.sourceId, sourceId))
    ).map((page) => [page.pageNumber, page.contentHash] as const)
  )

  const counts = new Map<number, number>()
  const anchored = new Map<number, Interval[]>()
  let unanchored = 0

  rows.forEach((row) => {
    const page = row.pageNumber
    // A hand-typed passage carries no page, so it belongs to the reading
    // without belonging anywhere on it. Counted, never placed.
    if (page == null || page <= 0) {
      unanchored += 1
      return
    }
    counts.set(page, (counts.get(page) ?? 0) + 1)

    const canonical = pageHashes.get(page)
    if (
      row.startOffset == null ||
      row.endOffset == null ||
      !canonical ||
      row.pageContentHash !== canonical
    ) {
      unanchored += 1
      return
    }
    const list = anchored.get(page) ?? []
    list.push({ start: row.startOffset, end: row.endOffset })
    anchored.set(page, list)
  })

  const pages: PageHeat[] = []
  let budget = MAX_SPANS
  let droppedSpans = 0

  ;[...counts.keys()]
    .sort((a, b) => a - b)
    .forEach((pageNumber) => {
      const all = heatSpans(anchored.get(pageNumber) ?? [])
      const spans = all.slice(0, Math.max(0, budget))
      budget -= spans.length
      droppedSpans += all.length - spans.length
      pages.push({
        pageNumber,
        count: counts.get(pageNumber)!,
        contentHash: pageHashes.get(pageNumber) ?? "",
        spans,
      })
    })

  return {
    ...base,
    contributors: new Set(rows.map((row) => row.userId)).size,
    passages: rows.length,
    pages,
    unanchored,
    droppedSpans,
  }
}

/**
 * What other people named — the Concepts and Links Overlays of the Vocabulary
 * tab (model §2, §3.4).
 *
 * `sourceId` scopes the comparison to one reading; null compares across the
 * whole course, which at the whole weave is every reading the peers have
 * coded. (It used to mean "every reading YOU have coded" — that was the
 * student gate doing double duty as a scope, and it went with the gate.)
 */
export async function getVocabularyOverlay(
  sourceIdRaw: string | null,
  band: OverlayBand = "section",
  sectionId?: string | null
): Promise<VocabularyOverlay> {
  const viewer = await overlayViewer()
  if (isBlocked(viewer)) return emptyVocabularyOverlay(band, viewer.blocked)

  const sourceId = (sourceIdRaw ?? "").trim() || null

  const peers = await peersOf(viewer, band, sectionId)
  if (isBlocked(peers)) return emptyVocabularyOverlay(band, peers.blocked)
  if (peers.length === 0) return emptyVocabularyOverlay(band, "no-peers")

  // One reading, or every reading these peers have coded. It used to be every
  // reading the VIEWER had coded — the student gate doing double duty as a
  // scope — which would now hold a faculty member to the texts they happened
  // to capture in.
  const scope = sourceId ? [sourceId] : await codedBy(peers)

  // A concept is evidenced in a scope when one of its passages came from a
  // reading in it — the derivation src/lib/scope.ts does for the student's own
  // graph, run here over other people's rows. A concept belongs to a person,
  // never to a reading, so this joins through the passage rather than reading
  // any column that claims otherwise.
  const conceptRows = await db
    .selectDistinct({
      id: concepts.id,
      userId: concepts.userId,
      label: concepts.label,
      def: concepts.def,
      createdAt: concepts.createdAt,
    })
    .from(concepts)
    .innerJoin(passageConcepts, eq(passageConcepts.conceptId, concepts.id))
    .innerJoin(passages, eq(passages.id, passageConcepts.passageId))
    .where(
      and(
        inArray(concepts.userId, peers),
        eq(concepts.courseId, viewer.courseId),
        inArray(passages.sourceId, scope)
      )
    )
    .orderBy(asc(concepts.createdAt), asc(concepts.id))

  const base = {
    ...emptyVocabularyOverlay(band, null),
    peers: peers.length,
    readings: scope.length,
    contributors: new Set(conceptRows.map((row) => row.userId)).size,
  }
  if (conceptRows.length === 0) return base

  const inScope = new Set(conceptRows.map((row) => row.id))
  const conceptIds = [...inScope]

  const edgeRows = await db
    .select({
      userId: edges.userId,
      fromId: edges.fromId,
      toId: edges.toId,
      handle: edges.handle,
      sentence: edges.sentence,
    })
    .from(edges)
    .where(
      and(
        inArray(edges.userId, peers),
        eq(edges.courseId, viewer.courseId),
        ...(conceptIds.length <= EDGE_PUSHDOWN_LIMIT ? [inArray(edges.fromId, conceptIds)] : [])
      )
    )
    .orderBy(asc(edges.createdAt), asc(edges.id))

  // Both ends in scope, exactly as `scopedGraph` requires: half a thread would
  // be a lie here for the same reason it is on the student's own cloth.
  const scopedEdges = edgeRows.filter((edge) => inScope.has(edge.fromId) && inScope.has(edge.toId))
  const labelled = scopedEdges.filter((edge) => (edge.handle ?? "").trim())

  const grouped = groupTerms(
    conceptRows.map((row) => ({ userId: row.userId, label: row.label, description: row.def }))
  )
  const links = groupTerms(
    labelled.map((edge) => ({
      userId: edge.userId,
      label: edge.handle ?? "",
      description: edge.sentence,
    }))
  )

  return {
    ...base,
    concepts: grouped.terms,
    moreConcepts: grouped.moreTerms,
    links: links.terms,
    moreLinks: links.moreTerms,
    unlabeledLinks: scopedEdges.length - labelled.length,
  }
}
