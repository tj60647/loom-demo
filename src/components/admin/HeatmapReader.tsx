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
}: {
  sourceId: string
  title: string
}) {
  return (
    <PdfViewer
      url={`/api/readings/${sourceId}`}
      sourceName={title}
      sourceId={sourceId}
      // No capture side here: this tab reads a cohort's marks, it does not
      // make any. `workOpen` false and no toggle means the Your-work panel
      // never opens, so nothing offers to write into the viewer's own loom.
      workOpen={false}
      onToggleWork={() => {}}
    />
  )
}
