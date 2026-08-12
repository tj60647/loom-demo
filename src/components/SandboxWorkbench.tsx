"use client"

/**
 * The client half of the practice loom (`/sandbox`).
 *
 * All it does is nest `SandboxLoomProvider` inside the real one. React
 * resolves `useContext` to the nearest provider, so every tab, the PDF
 * viewer, the capture modal, the linking shuttle and the board pick up the
 * sandbox's state instead of the student's own — with no change to any of
 * them. The workbench below is the real component, not a copy.
 */

import SandboxLoomProvider from "@/components/providers/SandboxLoomProvider"
import Workbench, { type WorkbenchSource } from "@/components/Workbench"
import type { LoomState } from "@/lib/types"

export default function SandboxWorkbench({
  sourceId,
  source,
  practiceCloth,
}: {
  /**
   * The worked cloth the practice loom opens with, read on the server from
   * this reading's own pages. Null when the reading cannot carry it, and the
   * loom opens empty — which is what it did before 2026-08-11.
   */
  practiceCloth?: LoomState | null
  sourceId: string
  source: {
    id: string
    title: string
    author: string | null
    sourceReference: string | null
    description: string | null
    isDescriptionVisible: boolean
    storageKey: string | null
    isOwn: boolean
  }
}) {
  const workbenchSource: WorkbenchSource = {
    id: source.id,
    title: source.title,
    author: source.author ?? "",
    week: null,
    hasFile: !!source.storageKey,
  }

  return (
    <SandboxLoomProvider sourceId={sourceId} initial={practiceCloth ?? undefined}>
      <Workbench source={workbenchSource} practice />
    </SandboxLoomProvider>
  )
}
