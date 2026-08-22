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
      // download, and the margin cards start hidden behind their own toggle
      // (TJ, 2026-08-22: "'your work' does not make sense to show, nor
      // download" — and "the heatmap should have a 'passage card' visibility
      // toggle. default is hidden").
      noOwnWork
      overlayStudentId={studentId}
      workOpen={false}
      onToggleWork={() => {}}
    />
  )
}
