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

const PdfViewer = dynamic(() => import("@/components/pdf/PdfViewer"), { ssr: false })

export default function HeatmapReader({
  sourceId,
  title,
  studentId,
}: {
  sourceId: string
  title: string
  /** Chosen in the scope strip; null means the whole class, by band. */
  studentId: string | null
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
      overlayStudentId={studentId}
      workOpen={false}
      onToggleWork={() => {}}
    />
  )
}
