"use client"

/**
 * Take the drawing away as a picture.
 *
 * TJ, 2026-08-23: "the cloth and the board need a download as svg button." The
 * two work surfaces that are drawings rather than lists — the cloth
 * (src/components/svg/ClothMap.tsx) and the board, which is what
 * src/components/tabs/MapTab.tsx:3 calls the card table.
 *
 * SVG rather than PNG, and the reason is the same one that makes these two
 * worth exporting at all: the cloth and the board are the student's own
 * arrangement of their own reading, and an arrangement is worth keeping at any
 * size — in a paper, on a wall, in a slide. A raster of a 480px-wide drawing is
 * a picture of a screen; the vector is the drawing.
 *
 * The button is a sibling of the existing `download .json` / `.md` pair
 * (src/components/ui/ObjectDownload.tsx) and wears the same ghost-mini
 * treatment, because it is the same act: this object, taken out whole.
 */

import { useState } from "react"
import { downloadText } from "@/lib/download"
import { objectExportFilename } from "@/lib/objectExport"
import { DRAWING_GROUND, serializeSvg } from "@/lib/svgExport"

export default function SvgDownload({
  /** The element to serialize, found when the button is pressed rather than held. */
  target,
  studentName,
  kind,
  slug,
  noun,
  label,
  tip,
  drop,
}: {
  /** A DOM id, not a ref: both drawings already carry one (#map, #cardTable),
   *  and reading it at click time means this never holds a stale node across a
   *  re-render of the drawing it points at. */
  target: string
  studentName: string
  /** The object kind, for the filename — "cloth", "board". */
  kind: string
  slug?: string
  noun?: string
  /**
   * The whole button text, when the surrounding heading already says what the
   * drawing is. The board's card is titled "The board" and this is the only
   * download in it, so "download the board .svg" says it twice (TJ,
   * 2026-08-23: "'download svg' as it is alreay in the board area"). The
   * cloth's keeps the longer form, because it stands beside the Capture Log's
   * "download the log" pair and has to name which object it hands over.
   */
  label?: string
  tip?: string
  /** Selectors dropped before serializing. See SvgExportOptions. */
  drop?: string[]
}) {
  const [said, setSaid] = useState<string | null>(null)

  const take = () => {
    const svg = document.getElementById(target)
    if (!(svg instanceof SVGSVGElement)) {
      // Named, not swallowed: a button that does nothing is worse than one
      // that says why. The drawing is always mounted when this is on screen,
      // so this is a wiring mistake rather than a state a reader can reach.
      console.error(`[SvgDownload] no <svg id="${target}"> on the page`)
      setSaid("could not read the drawing")
      window.setTimeout(() => setSaid(null), 2400)
      return
    }
    try {
      downloadText(
        serializeSvg(svg, { background: DRAWING_GROUND, drop }),
        objectExportFilename(studentName, kind, slug ?? kind, "svg"),
        "image/svg+xml"
      )
      setSaid("✓ taken")
      window.setTimeout(() => setSaid(null), 2000)
    } catch (error) {
      console.error("[SvgDownload] the drawing could not be serialized", error)
      setSaid("could not read the drawing")
      window.setTimeout(() => setSaid(null), 2400)
    }
  }

  return (
    <button
      className="btn ghost mini"
      onClick={take}
      data-tip={tip ?? "the drawing as it stands, as a vector file"}
    >
      {said ?? label ?? `download ${noun ?? kind} .svg`}
    </button>
  )
}
