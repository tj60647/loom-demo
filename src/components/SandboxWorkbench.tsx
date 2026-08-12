"use client"

/**
 * The client half of the practice loom (`/sandbox`).
 *
 * Two stages, because the guide's first beat is "open a reading" and that has
 * to be a move rather than a caption (TJ, 2026-08-12). The Library comes
 * first, with one card that opens; pressing it enters the workbench.
 *
 * Both stages sit inside `SandboxLoomProvider`. React resolves `useContext` to
 * the nearest provider, so every tab, the PDF viewer, the capture modal, the
 * linking shuttle and the board pick up the sandbox's state instead of the
 * student's own — with no change to any of them. The workbench below is the
 * real component, not a copy.
 *
 * The guide is mounted HERE rather than inside Workbench so it spans both
 * stages: it has to be on the shelf to point at the card.
 */

import { useState } from "react"
import SandboxLoomProvider from "@/components/providers/SandboxLoomProvider"
import PracticeGuide from "@/components/practice/PracticeGuide"
import PracticeShelf, { type PracticeCard } from "@/components/practice/PracticeShelf"
import JourneyNav from "@/components/ui/JourneyNav"
import Workbench, { type WorkbenchSource } from "@/components/Workbench"
import type { LoomState } from "@/lib/types"

export default function SandboxWorkbench({
  sourceId,
  source,
  cards,
  practiceCloth,
}: {
  /**
   * The worked cloth the practice loom opens with, read on the server from
   * this reading's own pages. Null when the reading cannot carry it, and the
   * loom opens empty — which is what it did before 2026-08-11.
   */
  practiceCloth?: LoomState | null
  /** The shelf's cards. Only `sourceId` opens. */
  cards: PracticeCard[]
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
  const [opened, setOpened] = useState(false)

  const workbenchSource: WorkbenchSource = {
    id: source.id,
    title: source.title,
    author: source.author ?? "",
    week: null,
    hasFile: !!source.storageKey,
  }

  const open = () => {
    setOpened(true)
    // The guide's first beat is done the moment the reading opens — the same
    // shape as its other beats, which watch for the act rather than a click
    // on Next.
    window.dispatchEvent(new Event("loom:practice-opened"))
  }

  return (
    <SandboxLoomProvider sourceId={sourceId} initial={practiceCloth ?? undefined}>
      <PracticeGuide />
      {opened ? (
        <Workbench source={workbenchSource} practice />
      ) : (
        <>
          <div className="scopebar">
            <span className="scopetitle">The practice loom</span>
            <span className="scopemeta">the real interface, on a real reading — nothing is kept</span>
          </div>
          <JourneyNav active="readings" />
          <PracticeShelf cards={cards} openableId={sourceId} onOpen={open} />
          <footer>
            <span className="fl">00 — LIBRARY</span>
            <span className="fr">PICK A READING</span>
          </footer>
        </>
      )}
    </SandboxLoomProvider>
  )
}
