"use server"

import { db } from "@/db"
import { viewingAsStudent } from "@/lib/viewAsServer"
import { resolveViewTarget } from "@/lib/viewUserServer"
import {
  passages,
  courseMemberships,
  courseSources,
  courses,
  sources,
  sourcePages,
  sourceRevisions,
  sourceScores,
  users,
} from "@/db/schema"
import { and, asc, count, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { after } from "next/server"
import { authOptions, isAdminUser } from "@/lib/auth"
import { deleteClientUploadBlob, readingStorage } from "@/lib/storage"
import { recordEvent } from "@/lib/graphEvent"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"
import { renderSourcePageImages } from "@/lib/pdfPages"
import { gatherSourceBlobKeys } from "@/lib/sourceBlobs"
import { extractPdfPageText, textLayerProjection } from "@/lib/pdfText"
import { hashText } from "@/lib/hash"
import { judgeSourceScore, recordHeuristicScore, rescoreSource } from "@/lib/readingScore"
import { reingestSource } from "@/lib/reingest"
import { isJudgeConfigured } from "@/lib/openrouter"
import { draftMetadataFromPages, type MetadataDraft } from "@/lib/metadataDraft"
import { MAX_READING_BYTES, MAX_READING_LABEL, formatBytes, isClientUploadPathname } from "@/lib/readingUpload"
import { revalidatePath } from "next/cache"
import { resolveCourseId, resolveCourseIdForUser } from "@/lib/courses"

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  if (!isAdminUser(session.user)) {
    const dbUser = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
    if (dbUser[0]?.role !== "ADMIN") throw new Error("Unauthorized")
  }

  return session
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function readInt(formData: FormData, key: string) {
  const raw = readText(formData, key)
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Core or supplemental, read the same way wherever it is set — the Courses
 * tab's Schedule foldout and the library's Add to Course both post the
 * "true"/"false" radio pair. Core unless told otherwise, matching the column's
 * own default: a form that forgets the field must not quietly demote a reading.
 */
function readIsCore(formData: FormData) {
  return formData.get("isCore") !== "false"
}

function revalidateLibrary() {
  revalidatePath("/admin/library")
  // Course reading lists render on the Courses tab, so every membership or
  // schedule change has to invalidate it too — otherwise a reading added from
  // the Readings tab doesn't appear in its course until something else evicts
  // the cache.
  revalidatePath("/admin/courses")
  revalidatePath("/")
}

/**
 * The whole shared library, independent of any course. This is the set an
 * instructor picks from when building a course reading list.
 */
export async function getLibrarySources({ includeArchived = false } = {}) {
  await requireAdmin()

  const rows = await db.select().from(sources).orderBy(asc(sources.title))
  return includeArchived ? rows : rows.filter((source) => !source.isArchived)
}

/**
 * The whole library, course-agnostic, with everything the Readings page needs
 * to render a reading on its own terms: its extraction score, which courses
 * currently include it, and the lineage of the file it is serving.
 *
 * Deliberately one query per table rather than a join — a reading can be in
 * many courses, and a join would fan the library out into duplicate rows that
 * the page would only have to regroup.
 */
export async function getLibraryOverview({ includeArchived = true } = {}) {
  await requireAdmin()

  const [library, scores, memberships, allCourses, revisions, people] = await Promise.all([
    db.select().from(sources).orderBy(asc(sources.title)),
    db.select().from(sourceScores),
    db
      .select({
        sourceId: courseSources.sourceId,
        courseId: courseSources.courseId,
        isVisible: courseSources.isVisible,
        week: courseSources.week,
        isCore: courseSources.isCore,
      })
      .from(courseSources),
    db.select().from(courses).orderBy(asc(courses.createdAt)),
    db.select().from(sourceRevisions).orderBy(asc(sourceRevisions.createdAt)),
    // Who added each own-reading: the badge names the student (TJ,
    // 2026-08-21, "badge them"). The whole user table is smaller than a
    // per-row lookup would cost.
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ])

  const scoreBySource = new Map(scores.map((score) => [score.sourceId, score]))
  const courseById = new Map(allCourses.map((course) => [course.id, course]))
  const personById = new Map(people.map((person) => [person.id, person]))

  // A revision row exists only for a file that REPLACED another, so the
  // original upload has none and a reading's version is its revision count + 1.
  // (The 0025 backfill wrote a single row for readings repaired before the
  // table existed, so their history may read shorter than it truly was — the
  // current version is still right, which is what the badge claims.)
  const revisionsBySource = new Map<string, typeof revisions>()
  for (const revision of revisions) {
    const existing = revisionsBySource.get(revision.sourceId)
    if (existing) existing.push(revision)
    else revisionsBySource.set(revision.sourceId, [revision])
  }

  const rows = library
    .filter((source) => includeArchived || !source.isArchived)
    .map((source) => ({
      ...source,
      score: scoreBySource.get(source.id) ?? null,
      revisions: revisionsBySource.get(source.id) ?? [],
      // Only an own-reading names its owner — for the course library the
      // uploader is an admin detail nobody asked to badge.
      owner: source.isOwn && source.createdByUserId
        ? (() => {
            const person = personById.get(source.createdByUserId)
            return person?.name ?? person?.email ?? "unknown"
          })()
        : null,
      courses: memberships
        .filter((row) => row.sourceId === source.id)
        .flatMap((row) => {
          const course = courseById.get(row.courseId)
          return course
            ? [{ id: course.id, name: course.name, term: course.term, ...row }]
            : []
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))

  // Courses a reading can still be added to are computed per-row in the page;
  // the full list is returned once so the page doesn't re-query it.
  return { readings: rows, courses: allCourses.filter((course) => !course.isArchived) }
}

/**
 * Every reading in every course, keyed by course id — what the Courses page
 * needs to show a course's full reading list inline.
 */
export async function getReadingsByCourse() {
  await requireAdmin()

  const rows = await db
    .select({ source: sources, link: courseSources })
    .from(courseSources)
    .innerJoin(sources, eq(sources.id, courseSources.sourceId))

  const byCourse = new Map<string, (typeof sources.$inferSelect & { link: typeof courseSources.$inferSelect })[]>()
  for (const row of rows) {
    const list = byCourse.get(row.link.courseId) ?? []
    list.push({ ...row.source, link: row.link })
    byCourse.set(row.link.courseId, list)
  }

  // Syllabus order: by week, then explicit position, then title.
  for (const list of byCourse.values()) {
    list.sort((a, b) => {
      const aWeek = a.link.week ?? Number.MAX_SAFE_INTEGER
      const bWeek = b.link.week ?? Number.MAX_SAFE_INTEGER
      if (aWeek !== bWeek) return aWeek - bWeek
      if (a.link.position !== b.link.position) return a.link.position - b.link.position
      return a.title.localeCompare(b.title)
    })
  }

  return byCourse
}

/**
 * Readings included in one course, with the per-course facts from the join.
 * Ordered the way a syllabus reads: by week, then explicit position, then title.
 */
export async function getCourseSources(courseIdRaw?: string | null) {
  await requireAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []

  const rows = await db
    .select({ source: sources, link: courseSources })
    .from(courseSources)
    .innerJoin(sources, eq(sources.id, courseSources.sourceId))
    .where(eq(courseSources.courseId, courseId))

  return rows
    .map((row) => ({ ...row.source, link: row.link }))
    .sort((a, b) => {
      const aWeek = a.link.week ?? Number.MAX_SAFE_INTEGER
      const bWeek = b.link.week ?? Number.MAX_SAFE_INTEGER
      if (aWeek !== bWeek) return aWeek - bWeek
      if (a.link.position !== b.link.position) return a.link.position - b.link.position
      return a.title.localeCompare(b.title)
    })
}

/**
 * The learner-facing shelf: readings published to the course this user is
 * working in, plus any reference-only readings they added for themselves.
 *
 * Their own readings carry no `course_source` row, so they appear here and on
 * nobody else's shelf. They exist because reading-first needs every passage to
 * belong to a reading — a passage from something the library does not hold
 * still needs a door (docs/archive/reading-scope-and-map-passes.md §A.6).
 */
export async function getSources(courseIdRaw?: string | null) {
  const session = await getServerSession(authOptions)

  // Open Loom (src/lib/viewUser.ts): the shelf becomes the STUDENT's shelf —
  // their course resolution, their own readings, and never the admin lens,
  // because the student it belongs to could not see an unpublished row.
  const viewing = await resolveViewTarget(session?.user?.id)
  const shelfOwnerId = viewing?.userId ?? session?.user?.id

  const courseId = shelfOwnerId
    ? await resolveCourseIdForUser(shelfOwnerId, courseIdRaw)
    : await resolveCourseId(courseIdRaw)

  // An admin's shelf includes UNPUBLISHED readings; a student's does not. The
  // student lens has to reach this or "view as student" would show a row no
  // student can see (TJ, 2026-08-09). It only ever NARROWS — withhold, never
  // grant. Deliberately not applied to `authorizeSourceAccess` below: that is
  // an authorization path, and the lens is a display preference.
  const admin = isAdminUser(session?.user) && !(await viewingAsStudent()) && !viewing

  const rows = courseId
    ? await db
        .select({ source: sources, link: courseSources })
        .from(courseSources)
        .innerJoin(sources, eq(sources.id, courseSources.sourceId))
        .where(
          admin
            ? eq(courseSources.courseId, courseId)
            : and(eq(courseSources.courseId, courseId), eq(courseSources.isVisible, true))
        )
    : []

  const mine = shelfOwnerId
    ? await db
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.isOwn, true),
            eq(sources.createdByUserId, shelfOwnerId),
            eq(sources.isArchived, false)
          )
        )
    : []

  const courseIds = new Set(rows.map((row) => row.source.id))

  return [
    ...rows.map((row) => ({
      ...row.source,
      isVisible: row.link.isVisible,
      week: row.link.week,
      // Core or supplemental is a fact about the reading IN THIS COURSE, so it
      // lives on the join and has to be carried across with the week. The
      // shelf groups by week and never showed it; the footer counts it.
      isCore: row.link.isCore,
    })),
    // A reading of the student's own that an instructor has since added to the
    // course is the course's copy — don't list it twice.
    ...mine
      .filter((source) => !courseIds.has(source.id))
      // A reading of your own is neither core nor supplemental — those are
      // the syllabus's words for the course's own list, and this card is on
      // nobody else's shelf. `isOwn` is what sorts it.
      .map((source) => ({ ...source, isVisible: true, week: null as number | null, isCore: false })),
  ].sort((a, b) => {
    const aWeek = a.week ?? Number.MAX_SAFE_INTEGER
    const bWeek = b.week ?? Number.MAX_SAFE_INTEGER
    if (aWeek !== bWeek) return aWeek - bWeek
    return a.title.localeCompare(b.title)
  })
}

/**
 * A student mints a card for something they are coding that the library does
 * not hold — a book, a lecture, anything with no PDF to upload. Title and
 * author only: this records WHERE a passage came from, and nothing about the
 * student's reading of it. When they DO hold the PDF,
 * `registerOwnUploadedReading` below is the door — same card, with the text
 * behind it.
 *
 * Deliberately not admin-gated, and deliberately not added to the course: the
 * deployment notes (§9) ratified students adding papers, and this is the
 * bounded version of that — visible to its author, invisible to everyone else.
 */
export async function createOwnReading(data: {
  title: string
  author?: string
  sourceReference?: string
}) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) throw new Error("Unauthorized")

  const title = data.title.trim()
  if (!title) throw new Error("A reading needs a title.")

  const [source] = await db
    .insert(sources)
    .values({
      title,
      author: data.author?.trim() || "",
      sourceReference: data.sourceReference?.trim() || "",
      description: "",
      isDescriptionVisible: false,
      isOwn: true,
      storageKey: null,
      createdByUserId: userId,
    })
    .returning()

  revalidatePath("/")
  return { id: source.id, title: source.title }
}

/**
 * Take a reading of your own off your shelf (TJ, 2026-08-17).
 *
 * Until now a student could card a reading and never remove it: `deleteSource`
 * opens with `requireAdmin`, and nothing else touched the row. So the shelf
 * only ever grew — a mistyped title, or a book carded to try something, stayed
 * forever. (It also meant the e2e suite could not clean up after itself: 80
 * own readings had accumulated on the test account by the time this was found,
 * 23 of them from one spec whose own docstring says it removes everything it
 * makes. It could not.)
 *
 * ARCHIVE, NOT DELETE, and the distinction is load-bearing:
 *
 *   - `passages.sourceId` is `onDelete: "set null"`, so really deleting the
 *     row would untether every passage captured from it — they would survive
 *     but lose which reading they came from, landing in the same bucket
 *     `attributePassages` exists to repair. `sourcePages`, `sourceScores` and
 *     `sourceRepairs` cascade, so the page text and any repair decisions would
 *     go too.
 *   - `isArchived` already existed and the learner shelf query already honours
 *     it, so this is a new act rather than a new state to filter for.
 *
 * The student's work is therefore untouched: the passages, their concepts and
 * the threads between them stay exactly where they were, and Vocabulary is
 * unscoped so the concepts remain in plain sight. What goes is the card, and
 * with it the door to that reading's own Capture Log — which is why the shelf
 * warns before doing it when there is work behind the card, and says how much.
 *
 * The file is NOT purged here. That stays an admin act (`deleteSource`
 * removes the row and the blob together), because a purge is the irreversible
 * half and an archive is meant to be undoable.
 *
 * Owner-gated on exactly the rule `updateOwnReadingMetadata` uses: your own
 * card, and yours. A course reading is not yours to retire.
 */
export async function archiveOwnReading(sourceId: string) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) throw new Error("Unauthorized")

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source || !source.isOwn || source.createdByUserId !== userId) {
    throw new Error("Reading not found")
  }
  // Idempotent: a double-submit should not write a second event saying it
  // happened twice.
  if (source.isArchived) return { id: source.id, title: source.title }

  await db.update(sources).set({ isArchived: true }).where(eq(sources.id, source.id))

  // Recorded like every other act. The payload carries the title because the
  // row it names may later be purged by an admin, and a log line reading
  // "removed a reading" with nothing to point at is not history.
  const kept = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(passages)
    .where(and(eq(passages.sourceId, source.id), eq(passages.userId, userId)))
  await recordEvent(userId, null, "reading.archive", "reading", source.id, {
    title: source.title,
    passages: kept[0]?.n ?? 0,
  })

  revalidatePath("/")
  revalidateLibrary()
  return { id: source.id, title: source.title }
}

/**
 * The learner half of the browser → Blob upload: a reading of the student's
 * own with the PDF behind it, so tab 00 and capture-from-the-text work the
 * same as for course readings. Storage checks match the admin path exactly —
 * prefix, size cap, PDF magic bytes — and the same ingest runs, but the
 * result keeps `createOwnReading`'s bounds: isOwn, never added to any course,
 * on this student's shelf and nobody else's (admins see it listed on the
 * Readings tab, as they do every own reading).
 *
 * The deterministic heuristic score runs inside ingest as always; the LLM
 * judge pass is deliberately NOT queued for private uploads — its tokens are
 * a curation cost the shared library justifies. An admin can Rescore from
 * the library if a private reading ever needs the reading-order check.
 */
/**
 * Move a browser-uploaded blob from its quarantine pathname into this
 * environment's own drawer, returning the key the row will record.
 *
 * The client upload cannot know the drawer — blobNamespace is server-side —
 * so its bytes land at the bare pathname in EVERY environment: in a preview
 * that meant writing into the shared root, and a namespaced delete() could
 * never reach the key the row recorded. Re-homing restores the storage
 * invariant (an environment writes only into its own space) and makes every
 * recorded storageKey one this environment may delete. The new key takes
 * createSource's server-upload shape (a bare UUID), so the CLIENT-UPLOAD
 * quarantine is transient: no new registration records its quarantine
 * pathname. (`readings/` itself is not exclusively transient — repair mints
 * durable `readings/<id>-repaired-<ms>.pdf` revision keys and the seed
 * records `readings/…` blobKeys; refuseClaimedUploadKey is what keeps those
 * out of this flow's reach.) Rows written before 2026-08-20 may still carry
 * a quarantine pathname — reads fall through to the bare key, so they keep
 * working; they remain beyond a namespaced delete, as they always were.
 *
 * In production the drawer IS the bare root, so this is a same-store copy —
 * one extra put per upload, kept for uniformity: one code path everywhere,
 * and the stored key is server-minted rather than client-named.
 */
/**
 * A quarantine-shaped pathname some row ALREADY records is not a fresh
 * upload — it is an existing reading's file, current or lineage. Everything
 * downstream of registration (re-homing, the size-cap rejection, the failure
 * cleanup) DELETES the pathname it was handed; rows written before
 * 2026-08-20 record their quarantine pathname as storageKey, and every
 * repair records `readings/<id>-repaired-<ms>.pdf` revision keys whose
 * timestamps are guessable — so without this check a signed-in caller could
 * hand registerOwnUploadedReading such a key and destroy a blob a row still
 * references. Both tables are checked: sources.storageKey (the served file)
 * and source_revision's storageKey/predecessorKey (the lineage the audit and
 * deleteSource walk). The legitimate flow never trips this — a fresh
 * upload's random-suffixed pathname is claimed by no row until this very
 * call records its re-homed successor.
 */
async function refuseClaimedUploadKey(storageKey: string): Promise<void> {
  const claimed = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.storageKey, storageKey))
    .limit(1)
  if (claimed.length === 0) {
    const lineage = await db
      .select({ id: sourceRevisions.id })
      .from(sourceRevisions)
      .where(
        or(
          eq(sourceRevisions.storageKey, storageKey),
          eq(sourceRevisions.predecessorKey, storageKey)
        )
      )
      .limit(1)
    if (lineage.length === 0) return
  }
  throw new Error("That pathname already belongs to a registered reading.")
}

async function rehomeClientUpload(quarantineKey: string, buffer: Buffer): Promise<string> {
  const storageKey = `${crypto.randomUUID()}.pdf`
  await readingStorage.put(storageKey, buffer)
  // Best-effort: a leftover quarantine blob is the pre-rehome status quo, and
  // the row about to be written already points at the drawer copy.
  await deleteClientUploadBlob(quarantineKey).catch(() => {})
  return storageKey
}

export async function registerOwnUploadedReading(data: {
  storageKey: string
  filename: string
  title?: string
  author?: string
  sourceReference?: string
}) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) throw new Error("Unauthorized")

  // Shape, not just prefix: everything downstream deletes the pathname it is
  // handed, and a dot-segment walks a bare startsWith check out of the
  // quarantine (isClientUploadPathname; adversarial review, 2026-08-20).
  if (!isClientUploadPathname(data.storageKey)) {
    throw new Error("That upload is not in the readings area.")
  }
  await refuseClaimedUploadKey(data.storageKey)

  const buffer = await readingStorage.get(data.storageKey)
  if (buffer.byteLength > MAX_READING_BYTES) {
    // The blob is still at its quarantine pathname — the drawer-scoped
    // delete() cannot reach a bare key, so the exact-pathname remover must.
    await deleteClientUploadBlob(data.storageKey).catch(() => {})
    throw new Error(`That file is ${formatBytes(buffer.byteLength)} — the limit is ${MAX_READING_LABEL}.`)
  }

  let storageKey: string | null = null
  let ingested = false
  try {
    storageKey = await rehomeClientUpload(data.storageKey, buffer)
    const source = await ingestReading({
      userId,
      isOwn: true,
      buffer,
      storageKey,
      filename: data.filename,
      title: data.title,
      author: data.author,
      sourceReference: data.sourceReference,
      isDescriptionVisible: false,
      metadataProvenance: "Student's own upload",
    })
    ingested = true
    revalidatePath("/")
    revalidateLibrary()
    return { id: source.id, title: source.title }
  } catch (error) {
    // Cleanup only while nothing references the blob — a failed ingest must
    // not leave it in storage. Which copy exists depends on how far we got:
    // after re-homing it is the drawer key; before, the quarantine pathname.
    // Once `ingested`, the row exists and the drawer key is the committed
    // reading's real file: a throw from the revalidates must not take it
    // (adversarial review, 2026-08-20).
    if (!ingested) {
      if (storageKey) await readingStorage.delete(storageKey).catch(() => {})
      else await deleteClientUploadBlob(data.storageKey).catch(() => {})
    }
    throw error
  }
}

/**
 * Registers a new reading in the shared library: stores the uploaded PDF bytes
 * in backend-managed storage (not /public, so it's only reachable via the
 * authenticated /api/readings/[sourceId] route) and extracts + persists the
 * canonical per-page text used to anchor highlight offsets.
 *
 * When `courseId` is given the reading is also included in that course, so the
 * common "upload straight into the course I'm building" path stays one step.
 */
export async function createSource(data: {
  courseId?: string | null
  title?: string
  author?: string
  sourceReference?: string
  description?: string
  isDescriptionVisible?: boolean
  metadataProvenance?: string
  file: File
}) {
  // Before the blob write, not after (audit S-5): an unauthorized caller must
  // not get bytes into storage even transiently.
  const session = await requireAdmin()

  const arrayBuffer = await data.file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const storageKey = `${crypto.randomUUID()}.pdf`
  await readingStorage.put(storageKey, buffer)

  try {
    return await ingestReading({ ...data, userId: session.user.id, buffer, storageKey, filename: data.file.name })
  } catch (error) {
    // The rollback inside ingestReading takes the row and the cover; the blob
    // this function put is its own to take, like every other caller's
    // (review, 2026-08-20 — this was the one caller whose catch was missing).
    await readingStorage.delete(storageKey).catch(() => {})
    throw error
  }
}

/**
 * Everything that happens once a reading's bytes are in storage, wherever they
 * came from: validate, record the row, extract the canonical page text, render
 * a cover.
 *
 * Shared by every upload path — `createSource`, `registerUploadedReading` and
 * `registerOwnUploadedReading` — so none can drift into ingesting a reading
 * differently from the others. It does NOT authenticate: each caller decides
 * who may reach it (admin for the library, any signed-in student for a
 * reading of their own) and hands the acting user in.
 */
async function ingestReading(data: {
  userId: string
  /** A student's own reading — their shelf only, never a course's list. */
  isOwn?: boolean
  courseId?: string | null
  title?: string
  author?: string
  sourceReference?: string
  description?: string
  isDescriptionVisible?: boolean
  metadataProvenance?: string
  buffer: Buffer
  storageKey: string
  filename: string
}) {
  const userId = data.userId
  const buffer = data.buffer

  // Verify this is actually a PDF (magic bytes: "%PDF-") before storing it
  // and serving it back with a `Content-Type: application/pdf` header —
  // don't trust the client-supplied MIME type or file extension alone.
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Uploaded file is not a valid PDF")
  }

  const fallbackTitle = data.filename.replace(/\.pdf$/i, "").trim() || "Untitled Reading"
  const title = data.title?.trim() || fallbackTitle
  const storageKey = data.storageKey

  // Before any row lands. Extraction is the step most likely to fail on a
  // hostile file, and it used to fail AFTER the source and course rows were
  // written — the caller's catch deleted the blob but not the rows, leaving a
  // visible card that 404s on open. Failing here fails clean: no rows, and the
  // caller still deletes the blob.
  const pages = await extractPdfPageText(buffer)

  const [source] = await db
    .insert(sources)
    .values({
      title,
      author: data.author || "",
      sourceReference: data.sourceReference || "",
      description: data.description || "",
      isDescriptionVisible: data.isDescriptionVisible ?? true,
      metadataProvenance: data.metadataProvenance || "",
      storageKey,
      byteLength: buffer.byteLength,
      isOwn: data.isOwn ?? false,
      createdByUserId: userId,
    })
    .returning()

  try {
    if (pages.length > 0) {
      await db.insert(sourcePages).values(
        pages.map((p) => ({
          sourceId: source.id,
          pageNumber: p.pageNumber,
          textContent: p.textContent,
          contentHash: hashText(textLayerProjection(p.textContent)),
          width: p.width,
          height: p.height,
        }))
      )
    }

    let coverRendered = false
    try {
      const coverBuffer = await renderPdfCoverImage(buffer)
      await readingStorage.put(getSourceCoverKey(source.id), coverBuffer)
      coverRendered = true
    } catch (error) {
      console.warn("[Loom] Failed to generate PDF cover image", error)
    }

    // The per-page images the viewer's contact sheet reads. Off the request
    // path: a long scan takes a minute or two to render at two widths, and
    // the upload response should not wait on pages nobody has opened yet.
    // Until they exist the viewer falls back to rendering from the PDF —
    // slower, never wrong.
    after(async () => {
      try {
        // Scheduled before scoring and the course attach, either of which can
        // still fail and roll the row back — and this callback fires after
        // the response regardless. Without the re-check it would render page
        // images and a sheet for a reading that no longer exists: blobs no
        // sweep will ever find, because the row that names their id is gone.
        const still = await db
          .select({ id: sources.id })
          .from(sources)
          .where(eq(sources.id, source.id))
          .limit(1)
        if (still.length === 0) return
        await renderSourcePageImages(source.id, buffer)
      } catch (error) {
        console.warn("[Loom] Failed to render page images at ingest", error)
      }
    })

    // Deterministic score, computed from the pages already in memory — no extra
    // queries, no network. The judge pass runs afterwards, off the request path.
    let pass: boolean | null = null
    try {
      pass = (await recordHeuristicScore(source.id, pages, { coverRendered })).pass
    } catch (error) {
      console.warn("[Loom] Failed to score extraction quality", error)
    }

    // The attach comes LAST, so the score exists to gate it: a reading that did
    // not measure usable arrives in the course hidden, and the card's Reveal
    // button is the explicit approval the old default-visible skipped. An
    // unscored reading (score failed, null) is hidden too — "we didn't check"
    // must not read as "checked and fine".
    if (data.courseId) {
      const courseId = await resolveCourseId(data.courseId)
      if (courseId) {
        await db
          .insert(courseSources)
          .values({ courseId, sourceId: source.id, isVisible: pass === true })
          .onConflictDoNothing()
      }
    }
  } catch (error) {
    // Without this, a failure between the source insert and here leaves the
    // phantom card the reorder above exists to prevent. Cascades take the
    // pages and any attach with the row; the caller's catch takes the blob.
    // The cover is this function's own put and nothing else records its key
    // once the row is gone, so it goes here too (no-op if the render failed
    // and it was never written).
    await db.delete(sources).where(eq(sources.id, source.id)).catch(() => {})
    await readingStorage.delete(getSourceCoverKey(source.id)).catch(() => {})
    throw error
  }

  return source
}

/**
 * Second half of the browser → Blob upload: the bytes are already in storage,
 * so this records the reading and runs the same ingest as any other upload.
 *
 * `storageKey` is the pathname the Blob SDK returned to the browser. It is
 * treated as untrusted input — the prefix is checked, the blob is fetched
 * server-side, and its real size and PDF magic bytes are verified here rather
 * than taken on the client's word. The verified bytes are then RE-HOMED into
 * this environment's own drawer under a server-minted key and the quarantine
 * pathname cleared (rehomeClientUpload): the browser wrote at the bare
 * pathname, which a namespaced environment could read but never delete — and
 * which, from a preview, was the shared root.
 */
export async function registerUploadedReading(data: {
  storageKey: string
  filename: string
  title?: string
  courseId?: string | null
}) {
  const session = await requireAdmin()

  // Shape, not just prefix: everything downstream deletes the pathname it is
  // handed, and a dot-segment walks a bare startsWith check out of the
  // quarantine (isClientUploadPathname; adversarial review, 2026-08-20).
  if (!isClientUploadPathname(data.storageKey)) {
    throw new Error("That upload is not in the readings area.")
  }
  await refuseClaimedUploadKey(data.storageKey)

  const buffer = await readingStorage.get(data.storageKey)

  // The token route caps this too, but a cap enforced only where the token is
  // minted is a cap on the polite path; re-check what actually landed.
  if (buffer.byteLength > MAX_READING_BYTES) {
    // Still at its quarantine pathname — the drawer-scoped delete() cannot
    // reach a bare key, so the exact-pathname remover must.
    await deleteClientUploadBlob(data.storageKey).catch(() => {})
    throw new Error(`That file is ${formatBytes(buffer.byteLength)} — the limit is ${MAX_READING_LABEL}.`)
  }

  let storageKey: string | null = null
  let ingested = false
  try {
    storageKey = await rehomeClientUpload(data.storageKey, buffer)
    const source = await ingestReading({
      userId: session.user.id,
      buffer,
      storageKey,
      filename: data.filename,
      title: data.title,
      courseId: data.courseId,
      metadataProvenance: "Pending review",
    })
    ingested = true

    revalidateLibrary()
    if (isJudgeConfigured()) {
      after(async () => {
        await judgeSourceScore(source.id)
        revalidateLibrary()
      })
    }
    return { id: source.id, title: source.title }
  } catch (error) {
    // Cleanup only while nothing references the blob — a failed ingest must
    // not leave it in storage costing money and confusing later audits.
    // Which copy exists depends on how far we got: after re-homing it is the
    // drawer key; before, the quarantine pathname. Once `ingested`, the row
    // exists and the drawer key is the committed reading's real file: a
    // throw from the revalidates or the after() scheduling must not take it
    // (adversarial review, 2026-08-20).
    if (!ingested) {
      if (storageKey) await readingStorage.delete(storageKey).catch(() => {})
      else await deleteClientUploadBlob(data.storageKey).catch(() => {})
    }
    throw error
  }
}

/** Re-runs both scoring passes, e.g. after a reading was re-uploaded. */
export async function rescoreSourceAction(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) return

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]

  // Nothing stored to re-read: a reference-only card has no PDF, so replaying
  // the rubric over its (absent) pages is all that can be done.
  if (!source?.storageKey) {
    await rescoreSource(sourceId)
    revalidateLibrary()
    return
  }

  // Refuse to touch a reading students have worked on. Re-ingesting replaces
  // the page text every stored offset was measured against; the batch script
  // carries a --force for the deliberate case, and this button should not be
  // the way that happens by accident.
  const [{ value: passageCount }] = await db
    .select({ value: count() })
    .from(passages)
    .where(eq(passages.sourceId, sourceId))

  if (passageCount > 0) {
    await rescoreSource(sourceId)
    revalidateLibrary()
    throw new Error(
      `Rescored, but the reading was not re-processed: ${passageCount} highlight${passageCount === 1 ? " is" : "s are"} anchored to its current text. ` +
        `Use "npx tsx scripts/reingest-readings.ts ${sourceId} --force" if you mean to replace it anyway.`
    )
  }

  // Full re-processing, not a rubric replay. `rescoreSource` re-reads the
  // STORED page rows, so on its own it can never show the effect of a repaired
  // PDF or of a change to extraction itself — and it carried the old
  // cover-rendered verdict forward, so a rebuilt cover never moved the score.
  // Re-ingesting settles all three together from the bytes as they stand.
  try {
    await reingestSource(sourceId, await readingStorage.get(source.storageKey))
  } catch (error) {
    console.warn("[Loom] Re-ingest failed during rescore; falling back to a rubric replay", error)
    await rescoreSource(sourceId)
  }

  if (isJudgeConfigured()) {
    after(async () => {
      await judgeSourceScore(sourceId)
      revalidateLibrary()
    })
  }
  revalidateLibrary()
}

/** Library-wide metadata. Not scoped to a course — the record is shared. */
/**
 * Draft this reading's metadata from its own extracted pages, for an
 * instructor to review.
 *
 * Ratified against red line #6 (TJ, 30 July 2026) and bounded by the same
 * shape as the extraction judge, plus one condition the judge did not need:
 * this returns a draft and writes NOTHING. The instructor edits and saves via
 * updateSourceMetadata, so no model-written text reaches a student unread.
 * Admin-only, like everything else in this file.
 */
export async function draftMetadataForSource(sourceId: string): Promise<MetadataDraft> {
  await requireAdmin()
  if (!sourceId) throw new Error("Source id is required")

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) throw new Error("Reading not found")

  return draftFromStoredPages(source)
}

/** The draft itself, shared by the admin and owner gates above and below. */
async function draftFromStoredPages(
  source: { id: string; title: string },
  reviewer: "an instructor" | "the reading's owner" = "an instructor"
): Promise<MetadataDraft> {
  const pages = await db
    .select({ pageNumber: sourcePages.pageNumber, textContent: sourcePages.textContent })
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, source.id))
    .orderBy(asc(sourcePages.pageNumber))

  return draftMetadataFromPages(pages, source.title, reviewer)
}

/**
 * The learner twin of draftMetadataForSource, for a reading of their own.
 * Same boundary as the admin button: this RETURNS a draft and writes nothing —
 * the student reads and edits every field before updateOwnReadingMetadata
 * saves it, so no model-written text lands anywhere unread (red line #6,
 * same exception, same condition). Owner-gated and isOwn-only: a course
 * reading's card belongs to the instructor.
 */
export async function draftMetadataForOwnSource(sourceId: string): Promise<MetadataDraft> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) throw new Error("Unauthorized")
  if (!sourceId) throw new Error("Source id is required")

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source || !source.isOwn || source.createdByUserId !== userId) {
    throw new Error("Reading not found")
  }

  return draftFromStoredPages(source, "the reading's owner")
}

/**
 * Owner-gated save for an own reading's card — title, author, and reference
 * only: an own card is a citation, not a library entry, and it shows no
 * description. Provenance rides along so a reviewed draft records itself as
 * one; absent, whatever provenance the row carries stands.
 */
export async function updateOwnReadingMetadata(data: {
  sourceId: string
  title: string
  author?: string
  sourceReference?: string
  metadataProvenance?: string
}) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) throw new Error("Unauthorized")

  const title = data.title.trim()
  if (!title) throw new Error("A reading needs a title.")

  const rows = await db.select().from(sources).where(eq(sources.id, data.sourceId)).limit(1)
  const source = rows[0]
  if (!source || !source.isOwn || source.createdByUserId !== userId) {
    throw new Error("Reading not found")
  }

  await db
    .update(sources)
    .set({
      title,
      author: data.author?.trim() || "",
      sourceReference: data.sourceReference?.trim() || "",
      ...(data.metadataProvenance ? { metadataProvenance: data.metadataProvenance } : {}),
    })
    .where(eq(sources.id, source.id))

  revalidatePath("/")
  revalidateLibrary()
  return { id: source.id, title }
}

export async function updateSourceMetadata(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) throw new Error("Source id is required")

  await db
    .update(sources)
    .set({
      title: readText(formData, "title") || "Untitled Reading",
      author: readText(formData, "author"),
      sourceReference: readText(formData, "sourceReference"),
      description: readText(formData, "description"),
      isDescriptionVisible: formData.get("isDescriptionVisible") === "on",
      metadataProvenance: readText(formData, "metadataProvenance"),
    })
    .where(eq(sources.id, sourceId))

  revalidateLibrary()
}

/**
 * Resolves a course id that the user picked explicitly.
 *
 * Unlike resolveCourseId, this never falls back to "the first course": the
 * caller named a specific course, so an unknown id is a mistake, and quietly
 * filing the reading somewhere else would be worse than doing nothing.
 */
async function exactCourseId(raw: string) {
  if (!raw) return null
  const rows = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, raw)).limit(1)
  return rows[0]?.id ?? null
}

export async function addSourceToCourse(formData: FormData) {
  await requireAdmin()

  const courseId = await exactCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  // Publication is gated on the score: a reading that did not measure usable —
  // or was never scored — arrives hidden, and the course card's Reveal button
  // is the admin's explicit approval. The old default-visible published the
  // moment of attach, before anyone had seen a verdict, which is how a scan
  // whose pages could not render shipped to students with a passing note.
  const score = await db
    .select({ pass: sourceScores.pass })
    .from(sourceScores)
    .where(eq(sourceScores.sourceId, sourceId))
    .limit(1)

  await db
    .insert(courseSources)
    .values({
      courseId,
      sourceId,
      week: readInt(formData, "week"),
      isCore: readIsCore(formData),
      isVisible: score[0]?.pass === true,
    })
    .onConflictDoNothing()

  revalidateLibrary()
}

/** Removes the reading from this course only. The library keeps the file. */
export async function removeSourceFromCourse(formData: FormData) {
  await requireAdmin()

  const courseId = await exactCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  await db
    .delete(courseSources)
    .where(and(eq(courseSources.courseId, courseId), eq(courseSources.sourceId, sourceId)))

  revalidateLibrary()
}

export async function setCourseSourceVisibility(formData: FormData) {
  await requireAdmin()

  const courseId = await exactCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  await db
    .update(courseSources)
    .set({ isVisible: formData.get("isVisible") === "true" })
    .where(and(eq(courseSources.courseId, courseId), eq(courseSources.sourceId, sourceId)))

  revalidateLibrary()
}

/**
 * When a reading is due in this course, and in what order that week.
 *
 * Named "schedule", not "placement": placement already means putting a
 * LEARNER in a section (see assignMemberSection), and one word for two
 * unrelated moves is how a roster edit gets mistaken for a syllabus edit.
 */
export async function updateCourseSourceSchedule(formData: FormData) {
  await requireAdmin()

  const courseId = await exactCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  await db
    .update(courseSources)
    .set({
      week: readInt(formData, "week"),
      position: readInt(formData, "position") ?? 0,
      isCore: readIsCore(formData),
    })
    .where(and(eq(courseSources.courseId, courseId), eq(courseSources.sourceId, sourceId)))

  revalidateLibrary()
}

export async function setSourceArchived(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) return

  await db
    .update(sources)
    .set({ isArchived: formData.get("isArchived") === "true" })
    .where(eq(sources.id, sourceId))

  revalidateLibrary()
}

/**
 * Deletes a reading from the shared library entirely: the current PDF, every
 * superseded revision blob, the per-page images, the contact sheet, the
 * repair crops and the cover. Course inclusions cascade away. Use
 * setSourceArchived to retire a reading without destroying it.
 */
export async function deleteSource(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) throw new Error("Source id is required")

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) return

  // Everything the store holds for this reading, gathered BEFORE the row
  // delete — the rows that name the revision blobs and the crop keys cascade
  // away with the source. The full list of key families, and why the two
  // callers that delete source rows must share it, lives on
  // gatherSourceBlobKeys (src/lib/sourceBlobs.ts).
  //
  // Gather-then-delete is unlocked — neon-http has no transactions — so an
  // applyAcceptedRepairs in flight when the delete lands can still mint one
  // revision blob after this sweep. Narrow (admin racing admin), and it fails
  // loudly on the apply side: its revision insert hits the missing row.
  const keys = await gatherSourceBlobKeys(sourceId, source.storageKey)

  await db.delete(sources).where(eq(sources.id, sourceId))

  // Best effort, every key attempted: a rejection is transport, not absence
  // (missing keys no-op), and stopping at the first failure would strand the
  // rest with the rows that named them already gone. Each failed key is
  // logged by name — after the cascade the server log is the ONLY remaining
  // record of what the store still holds — and the throw is for the operator
  // in dev; a production build redacts a Server Function's error message to a
  // digest, which is what correlates them to the logged lines.
  const keyList = [...keys]
  const results = await Promise.allSettled(keyList.map((key) => readingStorage.delete(key)))
  revalidateLibrary()
  const failedKeys: string[] = []
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      failedKeys.push(keyList[i])
      console.error(`[deleteSource] blob not removed: ${keyList[i]}`, result.reason)
    }
  })
  if (failedKeys.length > 0) {
    throw new Error(
      `Reading deleted, but ${failedKeys.length} of ${keys.size} stored blobs could not be removed: ${failedKeys.join(", ")}`
    )
  }
}

/**
 * Fetches the stored PDF. Admins can read anything; a learner may read a
 * reading only if it is published in a course they belong to. Visibility now
 * lives on the join, so this is a membership question rather than a flag on
 * the source.
 */
/**
 * May the current viewer see this reading at all?
 *
 * The rule, in one place because more than one caller needs it: an admin sees
 * everything; a student sees a reading of their own, or one published visibly
 * into a course they are currently a member of. Nothing else.
 *
 * Deliberately says nothing about FILES — a reference-only reading is a
 * citation with no PDF, and a student is entitled to name it as the source of a
 * passage even though there is nothing to serve. `authorizeSourceFile` adds
 * that requirement on top.
 *
 * Throws "Not found" rather than "Forbidden" throughout: whether a particular
 * reading exists is itself not public.
 */
export async function authorizeSourceAccess(sourceId: string) {
  const session = await getServerSession(authOptions)
  const admin = isAdminUser(session?.user)

  if (!session?.user?.id && process.env.NODE_ENV === "production") {
    throw new Error("Unauthorized")
  }

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) throw new Error("Not found")

  // A student's own reading is theirs; it was never published to a course, so
  // the membership check below cannot admit it.
  if (source.isOwn && source.createdByUserId === session?.user?.id) {
    return source
  }

  // An own reading belonging to SOMEONE ELSE is never admissible, and would
  // otherwise fall through the membership check below unexamined — it is in no
  // course, so `published` would be empty and throw, but only by accident.
  if (source.isOwn && !admin) throw new Error("Not found")

  if (!admin && session?.user?.id) {
    const memberships = await db
      .select({ courseId: courseMemberships.courseId })
      .from(courseMemberships)
      .where(
        and(eq(courseMemberships.userId, session.user.id), isNull(courseMemberships.removedAt))
      )

    if (memberships.length === 0) throw new Error("Not found")

    const published = await db
      .select({ sourceId: courseSources.sourceId })
      .from(courseSources)
      .where(
        and(
          eq(courseSources.sourceId, sourceId),
          eq(courseSources.isVisible, true),
          inArray(
            courseSources.courseId,
            memberships.map((row) => row.courseId)
          )
        )
      )
      .limit(1)

    if (published.length === 0) throw new Error("Not found")
  }

  return source
}

async function authorizeSourceFile(sourceId: string) {
  const source = await authorizeSourceAccess(sourceId)
  // A reference-only reading is a citation, not a file. Nothing to serve.
  if (!source.storageKey) throw new Error("Not found")
  return { source, storageKey: source.storageKey }
}

/**
 * Authorization and the source row, WITHOUT the file's bytes. The cover route
 * serves a small cached PNG on the happy path; fetching the whole PDF just to
 * prove the caller may see its thumbnail made every library page view
 * download the entire shelf — up to 20MB × every card (the CI stall of
 * 2026-08-02). Callers that go on to render fetch the bytes themselves from
 * `source.storageKey`, which authorization has already vouched for.
 */
export async function getSourceForCover(sourceId: string) {
  const { source } = await authorizeSourceFile(sourceId)
  return { source }
}

/** Same shape, same reason, for the per-page image route and the PDF route's
 *  conditional-request check: authorization and the row — storageKey included,
 *  which is what the ETag derives from — without pulling a single byte. */
export async function getSourceFileMeta(sourceId: string) {
  const { source } = await authorizeSourceFile(sourceId)
  return { source }
}

/**
 * The reading's bytes in memory. For callers that genuinely need the whole
 * file — cover rendering, text extraction. To send it to a browser, use
 * `getSourceFileStream`: buffering a reading larger than 4.5MB is fine here
 * and fatal in a Vercel Function response.
 */
export async function getSourceFile(sourceId: string) {
  const { source, storageKey } = await authorizeSourceFile(sourceId)
  return { source, buffer: await readingStorage.get(storageKey) }
}

/** The same reading, streamed — the form the PDF route serves. */
export async function getSourceFileStream(sourceId: string) {
  const { source, storageKey } = await authorizeSourceFile(sourceId)
  return { source, stream: await readingStorage.getStream(storageKey) }
}

/** One page of the manifest below. */
export type ReadingPageInfo = {
  pageNumber: number
  /** PDF points, rotation applied — null on rows extracted before the
   *  dimensions column existed and not yet backfilled. */
  width: number | null
  height: number | null
  /** Length of the browser text-layer string (the offset substrate), for
   *  placing card anchors on pages whose text layer is not mounted. */
  textLength: number
}

/**
 * What the viewer needs to lay a reading out BEFORE any page has rendered:
 * every page's own size, from the same extraction pass that produced the
 * canonical text. Without this the viewer guesses one shared aspect ratio and
 * corrects it page by page as they load — and on a scanned book whose pages
 * vary a few percent, every correction re-laid the whole matrix grid and
 * re-rendered every mounted page (the "aspect storm").
 *
 * Same gate as the file itself: the manifest describes the file.
 */
export async function getReadingPageManifest(sourceId: string) {
  await authorizeSourceAccess(sourceId)
  const rows = await db
    .select({
      pageNumber: sourcePages.pageNumber,
      width: sourcePages.width,
      height: sourcePages.height,
      textContent: sourcePages.textContent,
    })
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, sourceId))
    .orderBy(asc(sourcePages.pageNumber))

  const pages: ReadingPageInfo[] = rows.map((row) => ({
    pageNumber: row.pageNumber,
    width: row.width,
    height: row.height,
    textLength: textLayerProjection(row.textContent).length,
  }))
  return { pageCount: pages.length, pages }
}
