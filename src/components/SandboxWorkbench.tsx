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

export default function SandboxWorkbench({
  sourceId,
  source,
}: {
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
    <SandboxLoomProvider sourceId={sourceId}>
      <Workbench source={workbenchSource} practice />
    </SandboxLoomProvider>
  )
}
