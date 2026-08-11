"use client"

/**
 * The download that lives at its object.
 *
 * TJ, 2026-08-10: downloading happens "where they are made, not in a separate
 * tab", and red line 5's whole-artifact export is read BY OBJECT. So the
 * cloth downloads on its own card, the threads on Linking, the vocabulary on
 * Vocabulary — the same pair of buttons a Projection has always had, in the
 * same idiom, so the gesture is learned once.
 *
 * The builders are passed as thunks: an export is only shaped when a student
 * actually asks for one, never on every render of the tab it sits in.
 */

import { useReadings } from "@/components/providers/ReadingsProvider"
import { useLoom } from "@/components/providers/LoomProvider"
import { downloadText } from "@/lib/download"
import { objectExportFilename, provenanceOf, type ExportProvenance } from "@/lib/objectExport"

export default function ObjectDownload({
  kind,
  slug,
  json,
  markdown,
  tip,
}: {
  /** `cloth` | `threads` | `vocabulary` — becomes part of the filename. */
  kind: string
  /** The object's own name, slugified into the filename. */
  slug: string
  json: (provenance: ExportProvenance) => string
  markdown: (provenance: ExportProvenance) => string
  tip: string
}) {
  const { studentName, flash } = useLoom()
  const { course } = useReadings()

  /**
   * Student and course are what the client can honestly say. SECTION is
   * deliberately absent: `course.sections` is the staff overlay picker and is
   * empty for a learner by design, so there is nothing here to read — and a
   * file that guessed would be worse than one that omits. Stamping it needs a
   * server read (recorded in docs/keep-at-the-object.md).
   */
  const provenance = () =>
    provenanceOf(studentName, course ? `${course.name}${course.term ? ` · ${course.term}` : ""}` : undefined)

  return (
    <span className="objdl" data-tip={tip}>
      <button
        className="btn ghost mini"
        onClick={() => {
          const p = provenance()
          downloadText(json(p), objectExportFilename(studentName, kind, slug, "json"), "application/json")
          flash("· kept ·")
        }}
      >keep .json</button>
      <button
        className="btn ghost mini"
        onClick={() => {
          const p = provenance()
          downloadText(markdown(p), objectExportFilename(studentName, kind, slug, "md"), "text/markdown")
          flash("· kept ·")
        }}
      >keep .md</button>
    </span>
  )
}
