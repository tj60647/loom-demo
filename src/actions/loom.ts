"use server"

import { db } from "@/db"
import { concepts, bytes, edges, users, sourcePages } from "@/db/schema"
import { and, eq, isNull, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { resolveCourseIdForUser } from "@/lib/courses"

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

export async function getUserLoomData() {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  const userConcepts = await db.select().from(concepts).where(and(eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
  const userBytes = await db.select().from(bytes).where(and(eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
  const userEdges = await db.select().from(edges).where(and(eq(edges.userId, userId), inCourse(edges.courseId, courseId)))

  return { concepts: userConcepts, bytes: userBytes, edges: userEdges }
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

  return newConcept[0]
}

export async function updateConcept(id: string, data: Partial<{ label: string, def: string, note: string }>) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  await db.update(concepts).set(data).where(and(eq(concepts.id, id), eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
}

export async function deleteConcept(id: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)
  
  await db.delete(concepts).where(and(eq(concepts.id, id), eq(concepts.userId, userId), inCourse(concepts.courseId, courseId)))
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

  return newByte[0]
}

export async function deleteByte(id: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)
  
  await db.delete(bytes).where(and(eq(bytes.id, id), eq(bytes.userId, userId), inCourse(bytes.courseId, courseId)))
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

  return newEdge[0]
}

export async function updateEdge(id: string, data: Partial<{ handle: string, sentence: string }>) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)

  await db.update(edges).set(data).where(and(eq(edges.id, id), eq(edges.userId, userId), inCourse(edges.courseId, courseId)))
}

export async function deleteEdge(id: string) {
  const userId = await getUserId()
  const courseId = await resolveActiveCourseId(userId)
  
  await db.delete(edges).where(and(eq(edges.id, id), eq(edges.userId, userId), inCourse(edges.courseId, courseId)))
}
