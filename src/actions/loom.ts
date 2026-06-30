"use server"

import { db } from "@/db"
import { concepts, bytes, edges, users } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import type { Concept, Byte, Edge } from "@/lib/types"

export async function getUserLoomData() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  const userId = session.user.id

  const userConcepts = await db.select().from(concepts).where(eq(concepts.userId, userId))
  const userBytes = await db.select().from(bytes).where(eq(bytes.userId, userId))
  const userEdges = await db.select().from(edges).where(eq(edges.userId, userId))

  // The original app stores "read" text in state.read. We can store it on the user or a separate settings table.
  // For now, let's keep it simple and just use the user state if needed, or pass it separately.
  return { concepts: userConcepts, bytes: userBytes, edges: userEdges }
}

export async function createConcept(data: { label: string, def?: string, note?: string }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  const newConcept = await db.insert(concepts).values({
    userId: session.user.id,
    label: data.label,
    def: data.def || "",
    note: data.note || "",
  }).returning()

  return newConcept[0]
}

export async function updateConcept(id: string, data: Partial<{ label: string, def: string, note: string }>) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  await db.update(concepts).set(data).where(eq(concepts.id, id))
}

export async function deleteConcept(id: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")
  
  await db.delete(concepts).where(eq(concepts.id, id))
}

export async function createByte(data: { conceptId: string, source: string, location: string, content: string }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  const newByte = await db.insert(bytes).values({
    userId: session.user.id,
    ...data
  }).returning()

  return newByte[0]
}

export async function deleteByte(id: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")
  
  await db.delete(bytes).where(eq(bytes.id, id))
}

export async function createEdge(data: { fromId: string, toId: string, sentence: string }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  const newEdge = await db.insert(edges).values({
    userId: session.user.id,
    ...data
  }).returning()

  return newEdge[0]
}

export async function updateEdge(id: string, data: Partial<{ handle: string, sentence: string }>) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  await db.update(edges).set(data).where(eq(edges.id, id))
}

export async function deleteEdge(id: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")
  
  await db.delete(edges).where(eq(edges.id, id))
}
