"use server"

import { db } from "@/db"
import { sources, sourcePages, users } from "@/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { readingStorage } from "@/lib/storage"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"
import { extractPdfPageText } from "@/lib/pdfText"
import { hashText } from "@/lib/hash"
import { revalidatePath } from "next/cache"

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

export async function getSources() {
  const session = await getServerSession(authOptions)
  const admin = isAdminUser(session?.user)

  if (admin) {
    return db.select().from(sources).orderBy(asc(sources.createdAt))
  }

  return db
    .select()
    .from(sources)
    .where(eq(sources.isVisible, true))
    .orderBy(asc(sources.createdAt))
}

export async function getManageableSources() {
  await requireAdmin()
  return db.select().from(sources).orderBy(asc(sources.createdAt))
}

/**
 * Registers a new reading in the library: stores the uploaded PDF bytes in
 * backend-managed storage (not /public, so it's only reachable via the
 * authenticated /api/readings/[sourceId] route) and extracts + persists the
 * canonical per-page text used to anchor highlight offsets.
 */
export async function createSource(data: {
  title: string
  author?: string
  description?: string
  file: File
}) {
  const session = await requireAdmin()
  const userId = session.user.id

  const arrayBuffer = await data.file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Verify this is actually a PDF (magic bytes: "%PDF-") before storing it
  // and serving it back with a `Content-Type: application/pdf` header —
  // don't trust the client-supplied MIME type or file extension alone.
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Uploaded file is not a valid PDF")
  }

  const storageKey = `${crypto.randomUUID()}.pdf`
  await readingStorage.put(storageKey, buffer)

  const [source] = await db
    .insert(sources)
    .values({
      title: data.title,
      author: data.author || "",
      description: data.description || "",
      storageKey,
      createdByUserId: userId,
    })
    .returning()

  const pages = await extractPdfPageText(buffer)
  if (pages.length > 0) {
    await db.insert(sourcePages).values(
      pages.map((p) => ({
        sourceId: source.id,
        pageNumber: p.pageNumber,
        textContent: p.textContent,
        contentHash: hashText(p.textContent),
      }))
    )
  }

  try {
    const coverBuffer = await renderPdfCoverImage(buffer)
    await readingStorage.put(getSourceCoverKey(source.id), coverBuffer)
  } catch (error) {
    console.warn("[Loom] Failed to generate PDF cover image", error)
  }

  return source
}

export async function createSourceFromForm(formData: FormData) {
  const title = formData.get("title")
  const author = formData.get("author")
  const description = formData.get("description")
  const file = formData.get("file")

  if (typeof title !== "string" || !(file instanceof File) || !title.trim()) {
    throw new Error("Title and PDF file are required")
  }

  await createSource({
    title: title.trim(),
    author: typeof author === "string" ? author.trim() : "",
    description: typeof description === "string" ? description.trim() : "",
    file,
  })

  revalidatePath("/admin/library")
  revalidatePath("/")
}

export async function setSourceVisibility(sourceId: string, isVisible: boolean) {
  await requireAdmin()

  await db
    .update(sources)
    .set({ isVisible })
    .where(eq(sources.id, sourceId))

  revalidatePath("/admin/library")
  revalidatePath("/")
}

export async function deleteSource(sourceId: string) {
  await requireAdmin()

  const rows = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1)
  const source = rows[0]
  if (!source) {
    return
  }

  await db.delete(sources).where(eq(sources.id, sourceId))
  await readingStorage.delete(source.storageKey)

  revalidatePath("/admin/library")
  revalidatePath("/")
}

export async function getSourceFile(sourceId: string) {
  const session = await getServerSession(authOptions)
  const admin = isAdminUser(session?.user)
  if (!session?.user?.id && process.env.NODE_ENV === "production") {
    throw new Error("Unauthorized")
  }

  const rows = await db
    .select()
    .from(sources)
    .where(
      admin
        ? eq(sources.id, sourceId)
        : and(eq(sources.id, sourceId), eq(sources.isVisible, true))
    )
    .limit(1)
  const source = rows[0]
  if (!source) throw new Error("Not found")

  const buffer = await readingStorage.get(source.storageKey)
  return { source, buffer }
}
