"use client"

import { useRef, useState } from "react"

type SourceThumbnailProps = {
  sourceId: string
  title: string
  /** Override the frame height; otherwise it keeps a page-shaped aspect. */
  fixedHeight?: number
}

const FRAME_WIDTH = 140
/**
 * Page-shaped, near A4 (1:1.414). The readings themselves run 0.65-0.81 wide
 * over tall, so no single frame matches them all — the image is fitted inside
 * this one rather than cropped to it, which is why the frame can be constant
 * while the pages are not.
 */
const FRAME_ASPECT = 1.414

/**
 * Reads the cover's own edge colour so the letterbox continues the page
 * instead of framing it.
 *
 * The border ring is sampled rather than the whole image: what should fill the
 * space beside a page is the colour at that page's margin — white for a plain
 * scan, dark for a black book cover — not the average of its content, which on
 * a text page is a muddy grey. Falls back to white, which is also the starting
 * value, so a failure here is invisible rather than wrong.
 */
function edgeColor(image: HTMLImageElement): string | null {
  const SIZE = 24
  try {
    const canvas = document.createElement("canvas")
    canvas.width = SIZE
    canvas.height = SIZE
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, SIZE, SIZE)
    const { data } = context.getImageData(0, 0, SIZE, SIZE)

    let r = 0, g = 0, b = 0, n = 0
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // Border ring only.
        if (x > 1 && x < SIZE - 2 && y > 1 && y < SIZE - 2) continue
        const i = (y * SIZE + x) * 4
        if (data[i + 3] === 0) continue
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
      }
    }
    if (!n) return null
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`
  } catch {
    // Tainted canvas or no 2d context — keep the default rather than guess.
    return null
  }
}

export default function SourceThumbnail({ sourceId, title, fixedHeight }: SourceThumbnailProps) {
  const [loadError, setLoadError] = useState(false)
  const [background, setBackground] = useState("#ffffff")
  const imageRef = useRef<HTMLImageElement>(null)

  return (
    <div
      style={{
        width: `${FRAME_WIDTH}px`,
        flex: `0 0 ${FRAME_WIDTH}px`,
        // A fixed box, not a stretched one. Letting the frame take the card's
        // height made the thumbnail's shape depend on how much text sat beside
        // it, so the same reading was framed differently from card to card.
        height: `${fixedHeight ?? Math.round(FRAME_WIDTH * FRAME_ASPECT)}px`,
        alignSelf: "flex-start",
        border: "1px solid rgba(26,25,22,.14)",
        borderRadius: "6px",
        background,
        transition: "background-color .2s",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 12px 24px rgba(26,25,22,.09), 0 2px 6px rgba(26,25,22,.08)",
        position: "relative",
      }}
    >
      {loadError ? (
        <span className="cap" style={{ padding: "12px", textAlign: "center" }}>
          Preview unavailable
        </span>
      ) : (
        // A plain <img>, not next/image: these were already `unoptimized`, so
        // the component added nothing here, and the element reference is what
        // makes reading the cover's own colour possible.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          alt={`Preview of ${title}`}
          src={`/api/readings/${sourceId}/cover`}
          width={FRAME_WIDTH}
          style={{
            // contain, not cover: this is a document's own cover page, and
            // cropping it cut the margins off wider scans and sometimes the
            // title with them.
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center",
            display: "block",
          }}
          onLoad={() => {
            const found = imageRef.current ? edgeColor(imageRef.current) : null
            if (found) setBackground(found)
          }}
          onError={() => setLoadError(true)}
        />
      )}
    </div>
  )
}
