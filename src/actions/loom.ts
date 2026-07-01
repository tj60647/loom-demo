"use server"

import { db } from "@/db"
import { concepts, bytes, edges, users } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import type { Concept, Byte, Edge } from "@/lib/types"

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

export async function getUserLoomData() {
  const userId = await getUserId()

  const userConcepts = await db.select().from(concepts).where(eq(concepts.userId, userId))
  const userBytes = await db.select().from(bytes).where(eq(bytes.userId, userId))
  const userEdges = await db.select().from(edges).where(eq(edges.userId, userId))

  return { concepts: userConcepts, bytes: userBytes, edges: userEdges }
}

export async function createConcept(data: { label: string, def?: string, note?: string }) {
  const userId = await getUserId()

  const newConcept = await db.insert(concepts).values({
    userId,
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

export async function createByte(data: { conceptId: string, source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number }) {
  const userId = await getUserId()

  const newByte = await db.insert(bytes).values({
    userId,
    conceptId: data.conceptId,
    source: data.source,
    location: data.location,
    content: data.content,
    pageNumber: data.pageNumber,
    startOffset: data.startOffset,
    endOffset: data.endOffset,
  }).returning()

  return newByte[0]
}

export async function deleteByte(id: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")
  
  await db.delete(bytes).where(eq(bytes.id, id))
}

export async function createEdge(data: { fromId: string, toId: string, sentence: string }) {
  const userId = await getUserId()

  const newEdge = await db.insert(edges).values({
    userId,
    fromId: data.fromId,
    toId: data.toId,
    sentence: data.sentence,
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
