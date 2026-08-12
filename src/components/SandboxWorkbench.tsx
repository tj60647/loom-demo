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

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
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

  // What the card says it holds — read off the worked cloth itself, so the
  // shelf cannot claim a count the loom does not have.
  const tally = practiceCloth
    ? {
        passages: practiceCloth.passages.length,
        concepts: practiceCloth.concepts.length,
        threads: practiceCloth.edges.length,
        clothTitle: practiceCloth.cloths[0]?.title ?? "",
      }
    : null

  const workbenchSource: WorkbenchSource = {
    id: source.id,
    title: source.title,
    author: source.author ?? "",
    week: null,
    hasFile: !!source.storageKey,
  }

  // The guide's rail is a navigator, and pip 1 happens here. Without this it
  // was the one pip that went nowhere — it showed a beat about a glowing card
  // while you stood in the workbench with no card on screen. Nothing is lost:
  // the loom's state lives in the provider below, above this stage flag, so
  // the reading re-opens holding everything.
  useEffect(() => {
    const onStation = (e: Event) => {
      const station = (e as CustomEvent<string>).detail
      if (station === "library") setOpened(false)
    }
    window.addEventListener("loom:practice-station", onStation)
    return () => window.removeEventListener("loom:practice-station", onStation)
  }, [])

  // The standing notice rides above the guide's mask (or the dim seams across
  // it), which means it can also cover the control a beat is ringing. It gets
  // out of the way when the cutout reaches it.
  const bandRef = useRef<HTMLDivElement | null>(null)
  const [bandClear, setBandClear] = useState(true)
  useEffect(() => {
    const onHole = (e: Event) => {
      const hole = (e as CustomEvent<{ top: number; left: number; width: number; height: number } | null>).detail
      const band = bandRef.current?.getBoundingClientRect()
      const clear =
        !hole || !band ||
        hole.left > band.right || hole.left + hole.width < band.left ||
        hole.top > band.bottom || hole.top + hole.height < band.top
      setBandClear((was) => (was === clear ? was : clear))
    }
    window.addEventListener("loom:guide-hole", onHole)
    return () => window.removeEventListener("loom:guide-hole", onHole)
  }, [])

  const open = () => {
    setOpened(true)
    // The guide's first beat is done the moment the reading opens — the same
    // shape as its other beats, which watch for the act rather than a click
    // on Next.
    window.dispatchEvent(new Event("loom:practice-opened"))
  }

  return (
    <SandboxLoomProvider sourceId={sourceId} initial={practiceCloth ?? undefined}>
      {/* The standing notice, over BOTH stages: where you are, and nothing
          else. It has been cut twice by the same instinct. First it said
          "Practice loom" and explained how to reload the example — machinery,
          and a recovery from a loss nobody had had. Then it promised
          "Everything works and nothing is kept", which went too (TJ,
          2026-08-12): *"of course everything should work. i dont expect
          tutorial to keep my work."* Both halves were answers to questions a
          student was never asking. Persistent rather than a toast — `flash`
          self-clears after 1500ms, and a notice you missed cannot tell you
          where you are. Takes no pointer events: prose must never eat a
          control. */}
      <div ref={bandRef} className={`practiceband${bandClear ? "" : " yielded"}`} role="status">
        <span className="bandsay">
          <b>You are in the guide.</b>
        </span>
        {/* The way out (TJ, 2026-08-12). Until now the only exits were the
            browser's Back button and the header's own links — nothing on the
            page said the guide was a place you could leave. The band takes no
            pointer events; this does, or it would be a picture of a button.
            It survives the yield below: fading an escape hatch to sixteen per
            cent is worse than the occlusion the yield exists to prevent. */}
        <Link href="/" className="btn ghost mini bandexit">
          exit guide
        </Link>
      </div>
      <PracticeGuide />
      {opened ? (
        <Workbench source={workbenchSource} practice />
      ) : (
        <>
          {/* No scope bar: the real Library has none, and the practice loom's
              first stage must be the Library a student knows, not a
              differently-shaped page wearing its name (TJ, 2026-08-12). What
              this place IS gets said by the floating notice above. */}
          <JourneyNav active="readings" />
          <PracticeShelf cards={cards} openableId={sourceId} tally={tally} onOpen={open} />
          <footer>
            <span className="fl">00 — LIBRARY</span>
            <span className="fr">PICK A READING</span>
          </footer>
        </>
      )}
    </SandboxLoomProvider>
  )
}
