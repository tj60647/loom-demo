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
  noun,
  slug,
  json,
  markdown,
  tip,
  id,
  onTaken,
}: {
  /** `cloth` | `threads` | `vocabulary` — becomes part of the filename. */
  kind: string
  /**
   * What the button says it downloads (TJ, 2026-08-12: "that they all say keep
   * is not helpful. 'download projection .json' is more helpful than keep
   * .json"). Four of these sat on four stations all saying the same two words,
   * so which object you were taking depended on remembering where you were.
   * Defaults to the kind, which is already the object's name in every case
   * but the hyphenated ones.
   */
  noun?: string
  /** The object's own name, slugified into the filename. */
  slug: string
  json: (provenance: ExportProvenance) => string
  markdown: (provenance: ExportProvenance) => string
  tip: string
  /** For the practice guide, which glows a specific control. */
  id?: string
  /** Raised after either file is handed over — the guide listens for the kit. */
  onTaken?: () => void
}) {
  const { studentName, flash, openLoomViewer } = useLoom()
  const { course } = useReadings()

  /**
   * Student and course are what the client can honestly say. SECTION is
   * deliberately absent: `course.sections` is the staff overlay picker and is
   * empty for a learner by design, so there is nothing here to read — and a
   * file that guessed would be worse than one that omits. Stamping it needs a
   * server read (recorded in docs/keep-at-the-object.md).
   *
   * `openLoomViewer` is null for a student taking their own copy, so their
   * files are unchanged; when staff take one inside Open Loom it names them,
   * and provenanceOf turns that into the `open-loom` marker (TJ, 2026-08-22).
   */
  const provenance = () =>
    provenanceOf(
      studentName,
      course ? `${course.name}${course.term ? ` · ${course.term}` : ""}` : undefined,
      undefined,
      openLoomViewer ?? undefined
    )

  const what = noun ?? kind

  return (
    <span className="objdl" id={id} data-tip={tip}>
      <button
        className="btn ghost mini"
        onClick={() => {
          const p = provenance()
          downloadText(
            json(p),
            objectExportFilename(studentName, kind, slug, "json", undefined, !!openLoomViewer),
            "application/json"
          )
          flash(`· ${what} downloaded ·`)
          onTaken?.()
        }}
      >download {what} .json</button>
      <button
        className="btn ghost mini"
        onClick={() => {
          const p = provenance()
          downloadText(
            markdown(p),
            objectExportFilename(studentName, kind, slug, "md", undefined, !!openLoomViewer),
            "text/markdown"
          )
          flash(`· ${what} downloaded ·`)
          onTaken?.()
        }}
      >download {what} .md</button>
    </span>
  )
}
