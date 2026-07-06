"use server"

import { db } from "@/db"
import { allowedEmails, users, concepts, bytes, edges } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { revalidatePath } from "next/cache"

import { redirect } from "next/navigation"

export async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !isAdminUser(session.user)) {
    redirect("/")
  }

  return session
}

export async function getClassData() {
  await checkAdmin()
  
  const allUsers = await db.select().from(users)
  const allConcepts = await db.select().from(concepts)
  const allEdges = await db.select().from(edges)
  
  const userStats = allUsers.map(u => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    conceptsCount: allConcepts.filter(c => c.userId === u.id).length,
    edgesCount: allEdges.filter(e => e.userId === u.id).length
  }))
  
  return userStats
}

export async function getAllowedEmails() {
  await checkAdmin()

  return db.select().from(allowedEmails).orderBy(allowedEmails.email)
}

export async function addAllowedEmail(formData: FormData) {
  await checkAdmin()

  const rawEmail = formData.get("email")
  if (typeof rawEmail !== "string") {
    return
  }

  const email = rawEmail.toLowerCase().trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return
  }

  await db.insert(allowedEmails).values({ email }).onConflictDoNothing()
  revalidatePath("/admin")
}

export async function removeAllowedEmail(formData: FormData) {
  await checkAdmin()

  const rawEmail = formData.get("email")
  if (typeof rawEmail !== "string") {
    return
  }

  const email = rawEmail.toLowerCase().trim()
  if (!email) {
    return
  }

  await db.delete(allowedEmails).where(eq(allowedEmails.email, email))
  revalidatePath("/admin")
}

export async function getUserLoomDataAsAdmin(targetUserId: string) {
  await checkAdmin()
  
  const userConcepts = await db.select().from(concepts).where(eq(concepts.userId, targetUserId))
  const userBytes = await db.select().from(bytes).where(eq(bytes.userId, targetUserId))
  const userEdges = await db.select().from(edges).where(eq(edges.userId, targetUserId))
  
  return { concepts: userConcepts, bytes: userBytes, edges: userEdges }
}

export async function getAggregateLoomData() {
  await checkAdmin()
  
  const allConcepts = await db.select().from(concepts)
  const allBytes = await db.select().from(bytes)
  const allEdges = await db.select().from(edges)
  
  return { concepts: allConcepts, bytes: allBytes, edges: allEdges }
}
