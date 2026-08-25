"use client"

/**
 * The viewer, mounted for the Heatmaps tab.
 *
 * A thin host on purpose: `PdfViewer` already carries the 1 page / 2 pages /
 * Canvas control and the staff Overlay picker, and it takes plain props with
 * no route coupling, so the tab needs no second copy of either. What this adds
 * is the mount and nothing else.
 *
 * `ssr: false` for the same reason the Workbench mounts it that way — pdf.js
 * wants a DOM.
 */

import dynamic from "next/dynamic"
import type { Concept, Passage } from "@/lib/types"

const PdfViewer = dynamic(() => import("@/components/pdf/PdfViewer"), { ssr: false })

export default function HeatmapReader({
  sourceId,
  title,
  studentId,
  scopeSectionId,
  scopePassages,
  scopeConcepts,
}: {
  sourceId: string
  title: string
  /** Chosen in the scope strip; null means the whole class, by band. */
  studentId: string | null
  /** The section chosen in the strip, which the heat is drawn for. */
  scopeSectionId: string | null
  /**
   * The chosen student's passages in this reading, and the concepts they
   * evidence — empty unless exactly one student is chosen (TJ, 2026-08-23:
   * "make it available only when 1 student is selected"). Fetched on the
   * server so the viewer needs no route of its own; see the page.
   */
  scopePassages: Passage[]
  scopeConcepts: Concept[]
}) {
  return (
    <PdfViewer
      url={`/api/readings/${sourceId}`}
      sourceName={title}
      sourceId={sourceId}
      // Nothing of the reader's own: no Your work panel or toggle, no PDF
      // download, no capture, and their own highlights and margin cards start
      // hidden behind the My marks toggle (TJ, 2026-08-22: "'your work' does
      // not make sense to show, nor download"; "the heatmap should have a
      // 'passage card' visibility toggle. default is hidden"; and "why is
      // there any yellow highlight? for the heatmap view there should not
      // be").
      noOwnWork
      // The tab opens ON the cohort. A page called Heatmaps that arrives with
      // no heat asks the reader to switch on the only thing they came for
      // (TJ, 2026-08-22: "default overlay should be 'all'"). The strip's
      // student picker still overrides it, and clearing that picker comes
      // back here rather than to a blank page.
      defaultOverlayBand="cohort"
      // …and on the CANVAS (TJ, 2026-08-22: "let the default heatmap view be
      // canvas"). The tab asks where a cohort has been across a whole
      // reading, and only the contact sheet answers that in one look — which
      // is what the heat was projected into page-normalized geometry for.
      defaultViewMode="matrix"
      // The Overlay picker lives HERE and nowhere else (TJ, 2026-08-23: "the
      // overlay view should only be available in the heatmap, not in
      // reading"). It sat in the reading toolbar for every staff viewer too,
      // which made it the same control in two places — and the reading station
      // is the one where comparing yourself with the cohort is not the
      // question being asked.
      overlayPicker
      overlayStudentId={studentId}
      scopeSectionId={scopeSectionId}
      // The cards the toggle shows, and the concepts they are filed under.
      // Empty for "All students", which is what hides the toggle entirely.
      scopePassages={scopePassages}
      scopeConcepts={scopeConcepts}
      workOpen={false}
      onToggleWork={() => {}}
    />
  )
}
