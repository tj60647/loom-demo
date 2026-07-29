"use server"

import { db } from "@/db"
import { users, concepts, bytes, edges, courseMemberships, courseAllowedEmails, sections } from "@/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { resolveCourseId, resolveSectionId } from "@/lib/courses"

import { redirect } from "next/navigation"

export async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !isAdminUser(session.user)) {
    redirect("/")
  }

  return session
}

/**
 * Member ids for a course, optionally narrowed to one section.
 *
 * Note this no longer auto-enrols every user on first touch, as the old
 * ensureCourseContext did. That was a one-course migration convenience; with
 * several sections it would sweep the entire roster into each new one.
 * Enrolment now happens on sign-in from the course allowlist.
 */
async function getMemberIds(courseId: string, sectionId?: string | null) {
  const rows = await db
    .select({ userId: courseMemberships.userId })
    .from(courseMemberships)
    .where(
      sectionId
        ? and(
            eq(courseMemberships.courseId, courseId),
            eq(courseMemberships.sectionId, sectionId)
          )
        : eq(courseMemberships.courseId, courseId)
    )

  return rows.map((row) => row.userId)
}

export async function getClassData(courseIdRaw?: string | null, sectionIdRaw?: string | null) {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []

  const sectionId = await resolveSectionId(courseId, sectionIdRaw)

  const memberships = await db
    .select({ userId: courseMemberships.userId, sectionId: courseMemberships.sectionId })
    .from(courseMemberships)
    .where(
      sectionId
        ? and(
            eq(courseMemberships.courseId, courseId),
            eq(courseMemberships.sectionId, sectionId)
          )
        : eq(courseMemberships.courseId, courseId)
    )

  if (memberships.length === 0) {
    return []
  }

  const userIds = memberships.map((membership) => membership.userId)
  const allUsers = await db.select().from(users).where(inArray(users.id, userIds))
  const allConcepts = await db.select().from(concepts).where(inArray(concepts.userId, userIds))
  const allEdges = await db.select().from(edges).where(inArray(edges.userId, userIds))
  const sectionById = new Map(
    (await db.select().from(sections).where(eq(sections.courseId, courseId))).map((s) => [s.id, s])
  )

  return allUsers.map((u) => {
    const membership = memberships.find((m) => m.userId === u.id)
    return {
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      sectionId: membership?.sectionId ?? null,
      sectionName: membership?.sectionId
        ? sectionById.get(membership.sectionId)?.name ?? null
        : null,
      conceptsCount: allConcepts.filter((c) => c.userId === u.id).length,
      edgesCount: allEdges.filter((e) => e.userId === u.id).length,
    }
  })
}

export async function getAllowedEmails(courseIdRaw?: string | null) {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []

  return db
    .select({ email: courseAllowedEmails.email, sectionId: courseAllowedEmails.sectionId })
    .from(courseAllowedEmails)
    .where(eq(courseAllowedEmails.courseId, courseId))
    .orderBy(courseAllowedEmails.email)
}

export async function addAllowedEmail(formData: FormData) {
  await checkAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await resolveCourseId(typeof courseIdRaw === "string" ? courseIdRaw : null)
  if (!courseId) return

  const rawEmail = formData.get("email")
  if (typeof rawEmail !== "string") {
    return
  }

  const email = rawEmail.toLowerCase().trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return
  }

  const rawSectionId = formData.get("sectionId")
  const sectionId = await resolveSectionId(
    courseId,
    typeof rawSectionId === "string" ? rawSectionId : null
  )

  await db
    .insert(courseAllowedEmails)
    .values({ courseId, email, sectionId })
    .onConflictDoUpdate({
      target: [courseAllowedEmails.courseId, courseAllowedEmails.email],
      set: { sectionId },
    })

  revalidatePath("/admin")
}

export async function removeAllowedEmail(formData: FormData) {
  await checkAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await resolveCourseId(typeof courseIdRaw === "string" ? courseIdRaw : null)
  if (!courseId) return

  const rawEmail = formData.get("email")
  if (typeof rawEmail !== "string") {
    return
  }

  const email = rawEmail.toLowerCase().trim()
  if (!email) {
    return
  }

  await db
    .delete(courseAllowedEmails)
    .where(and(eq(courseAllowedEmails.courseId, courseId), eq(courseAllowedEmails.email, email)))
  revalidatePath("/admin")
}

export async function getUserLoomDataAsAdmin(targetUserId: string, courseIdRaw?: string | null) {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return { concepts: [], bytes: [], edges: [] }

  const userConcepts = await db.select().from(concepts).where(and(eq(concepts.userId, targetUserId), eq(concepts.courseId, courseId)))
  const userBytes = await db.select().from(bytes).where(and(eq(bytes.userId, targetUserId), eq(bytes.courseId, courseId)))
  const userEdges = await db.select().from(edges).where(and(eq(edges.userId, targetUserId), eq(edges.courseId, courseId)))

  return { concepts: userConcepts, bytes: userBytes, edges: userEdges }
}

export async function getAggregateLoomData(
  courseIdRaw?: string | null,
  sectionIdRaw?: string | null
) {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) {
    return { concepts: [], bytes: [], edges: [], bytesUnavailable: false }
  }

  const sectionId = await resolveSectionId(courseId, sectionIdRaw)
  const userIds = await getMemberIds(courseId, sectionId)

  if (userIds.length === 0) {
    return { concepts: [], bytes: [], edges: [], bytesUnavailable: false }
  }

  const allConcepts = await db
    .select()
    .from(concepts)
    .where(and(eq(concepts.courseId, courseId), inArray(concepts.userId, userIds)))
  const allEdges = await db
    .select()
    .from(edges)
    .where(and(eq(edges.courseId, courseId), inArray(edges.userId, userIds)))

  try {
    const allBytes = await db
      .select()
      .from(bytes)
      .where(and(eq(bytes.courseId, courseId), inArray(bytes.userId, userIds)))
    return { concepts: allConcepts, bytes: allBytes, edges: allEdges, bytesUnavailable: false }
  } catch (error) {
    // Fail soft so aggregate map still renders if byte schema/data is temporarily inconsistent.
    console.error("[getAggregateLoomData] Failed to load bytes for aggregate view", error)
    return { concepts: allConcepts, bytes: [], edges: allEdges, bytesUnavailable: true }
  }
}
