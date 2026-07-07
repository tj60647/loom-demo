"use server"

import { db } from "@/db"
import { allowedEmails, users, concepts, bytes, edges, courses, courseMemberships, courseAllowedEmails } from "@/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { DEFAULT_COURSE_ID, getCourseLabel, normalizeCourseId } from "@/lib/courseConfig"

import { redirect } from "next/navigation"

export async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !isAdminUser(session.user)) {
    redirect("/")
  }

  return session
}

export async function ensureCourseContext(courseIdRaw: string) {
  const courseId = normalizeCourseId(courseIdRaw)

  await db
    .insert(courses)
    .values({ id: courseId, slug: courseId, name: getCourseLabel(courseId) })
    .onConflictDoNothing()

  const membershipProbe = await db
    .select({ userId: courseMemberships.userId })
    .from(courseMemberships)
    .where(eq(courseMemberships.courseId, courseId))
    .limit(1)

  if (membershipProbe.length === 0) {
    const allUsers = await db.select({ id: users.id, role: users.role }).from(users)
    if (allUsers.length > 0) {
      await db
        .insert(courseMemberships)
        .values(
          allUsers.map((user) => ({
            courseId,
            userId: user.id,
            role: user.role === "ADMIN" ? "INSTRUCTOR" : "LEARNER",
          }))
        )
        .onConflictDoNothing()
    }
  }

  const allowlistProbe = await db
    .select({ email: courseAllowedEmails.email })
    .from(courseAllowedEmails)
    .where(eq(courseAllowedEmails.courseId, courseId))
    .limit(1)

  if (allowlistProbe.length === 0) {
    const legacyAllowlist = await db.select({ email: allowedEmails.email }).from(allowedEmails)
    if (legacyAllowlist.length > 0) {
      await db
        .insert(courseAllowedEmails)
        .values(legacyAllowlist.map((row) => ({ courseId, email: row.email })))
        .onConflictDoNothing()
    }
  }

  return courseId
}

export async function getClassData(courseIdRaw: string = DEFAULT_COURSE_ID) {
  await checkAdmin()

  const courseId = await ensureCourseContext(courseIdRaw)

  const memberships = await db
    .select({ userId: courseMemberships.userId })
    .from(courseMemberships)
    .where(eq(courseMemberships.courseId, courseId))

  if (memberships.length === 0) {
    return []
  }

  const userIds = memberships.map((membership) => membership.userId)
  const allUsers = await db.select().from(users).where(inArray(users.id, userIds))
  const allConcepts = await db.select().from(concepts).where(inArray(concepts.userId, userIds))
  const allEdges = await db.select().from(edges).where(inArray(edges.userId, userIds))
  
  const userStats = allUsers.map(u => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    conceptsCount: allConcepts.filter(c => c.userId === u.id).length,
    edgesCount: allEdges.filter(e => e.userId === u.id).length
  }))
  
  return userStats
}

export async function getAllowedEmails(courseIdRaw: string = DEFAULT_COURSE_ID) {
  await checkAdmin()
  const courseId = await ensureCourseContext(courseIdRaw)

  return db
    .select({ email: courseAllowedEmails.email })
    .from(courseAllowedEmails)
    .where(eq(courseAllowedEmails.courseId, courseId))
    .orderBy(courseAllowedEmails.email)
}

export async function addAllowedEmail(formData: FormData) {
  await checkAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await ensureCourseContext(typeof courseIdRaw === "string" ? courseIdRaw : DEFAULT_COURSE_ID)

  const rawEmail = formData.get("email")
  if (typeof rawEmail !== "string") {
    return
  }

  const email = rawEmail.toLowerCase().trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return
  }

  await db.insert(courseAllowedEmails).values({ courseId, email }).onConflictDoNothing()
  revalidatePath("/admin")
}

export async function removeAllowedEmail(formData: FormData) {
  await checkAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await ensureCourseContext(typeof courseIdRaw === "string" ? courseIdRaw : DEFAULT_COURSE_ID)

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

export async function getUserLoomDataAsAdmin(targetUserId: string, courseIdRaw: string = DEFAULT_COURSE_ID) {
  await checkAdmin()
  const courseId = await ensureCourseContext(courseIdRaw)
  
  const userConcepts = await db.select().from(concepts).where(and(eq(concepts.userId, targetUserId), eq(concepts.courseId, courseId)))
  const userBytes = await db.select().from(bytes).where(and(eq(bytes.userId, targetUserId), eq(bytes.courseId, courseId)))
  const userEdges = await db.select().from(edges).where(and(eq(edges.userId, targetUserId), eq(edges.courseId, courseId)))
  
  return { concepts: userConcepts, bytes: userBytes, edges: userEdges }
}

export async function getAggregateLoomData(courseIdRaw: string = DEFAULT_COURSE_ID) {
  await checkAdmin()

  try {
    const courseId = await ensureCourseContext(courseIdRaw)

    const memberships = await db
      .select({ userId: courseMemberships.userId })
      .from(courseMemberships)
      .where(eq(courseMemberships.courseId, courseId))

    if (memberships.length === 0) {
      return { concepts: [], bytes: [], edges: [], bytesUnavailable: false }
    }

    const userIds = memberships.map((membership) => membership.userId)

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
  } catch (error) {
    // Compatibility fallback for environments that have not applied course-scoping columns yet.
    console.error("[getAggregateLoomData] Falling back to legacy aggregate query", error)

    const allConcepts = await db.select().from(concepts)
    const allEdges = await db.select().from(edges)

    try {
      const allBytes = await db.select().from(bytes)
      return { concepts: allConcepts, bytes: allBytes, edges: allEdges, bytesUnavailable: false }
    } catch (bytesError) {
      console.error("[getAggregateLoomData] Failed to load bytes in legacy fallback", bytesError)
      return { concepts: allConcepts, bytes: [], edges: allEdges, bytesUnavailable: true }
    }
  }
}
