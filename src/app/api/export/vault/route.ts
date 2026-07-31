import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserLoomData } from "@/actions/loom"
import { getSourcesByIds } from "@/actions/sources"
import { buildSlugMap, renderConceptMarkdown } from "@/lib/conceptMarkdown"
import JSZip from "jszip"

// Exports the current user's Loom concept map as a flat folder of markdown
// files with Obsidian-compatible frontmatter and wikilinks, so it can be
// unzipped straight into (or as) an Obsidian vault.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { concepts, bytes, edges } = await getUserLoomData()

  const sourceIds = [...new Set(bytes.map(b => b.sourceId).filter((x): x is string => !!x))]
  const sourceRows = await getSourcesByIds(sourceIds)
  const sourcesById = new Map(sourceRows.map(s => [s.id, s]))
  const conceptsById = new Map(concepts.map(c => [c.id, c]))
  const slugsById = buildSlugMap(concepts)

  const zip = new JSZip()
  for (const concept of concepts) {
    const md = renderConceptMarkdown({
      concept,
      bytesForConcept: bytes.filter(b => b.conceptId === concept.id),
      outgoingEdges: edges.filter(e => e.fromId === concept.id),
      incomingEdges: edges.filter(e => e.toId === concept.id),
      conceptsById, slugsById, sourcesById,
    })
    zip.file(`${slugsById.get(concept.id)}.md`, md)
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" })
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="loom-vault.zip"',
    },
  })
}
