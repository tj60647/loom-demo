"use server"

import { db } from "@/db"
import { sources, sourcePages, users } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { readingStorage } from "@/lib/storage"
import { extractPdfPageText } from "@/lib/pdfText"
import { hashText } from "@/lib/hash"

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  if (session.user.role !== "ADMIN") {
    const dbUser = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
    if (dbUser[0]?.role !== "ADMIN") throw new Error("Unauthorized")
  }

  return session.user.id
}

export async function getSources() {
  return db.select().from(sources).orderBy(sources.createdAt)
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
  const userId = await requireAdmin()

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

  return source
}

export async function getSourceFile(sourceId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  const rows = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1)
  const source = rows[0]
  if (!source) throw new Error("Not found")

  const buffer = await readingStorage.get(source.storageKey)
  return { source, buffer }
}
