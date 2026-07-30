"use client"

import { useState } from "react"
import Image from "next/image"

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

export default function SourceThumbnail({ sourceId, title, fixedHeight }: SourceThumbnailProps) {
  const [loadError, setLoadError] = useState(false)

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
        background: "linear-gradient(180deg, #f7f4ea 0%, #ece6d7 100%)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 12px 24px rgba(26,25,22,.09), 0 2px 6px rgba(26,25,22,.08)",
        position: "relative",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(255,255,255,.32), rgba(255,255,255,0))",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      {loadError ? (
        <span className="cap" style={{ padding: "12px", textAlign: "center", position: "relative", zIndex: 1 }}>
          Preview unavailable
        </span>
      ) : (
        <Image
          alt={`Preview of ${title}`}
          src={`/api/readings/${sourceId}/cover`}
          fill
          unoptimized
          sizes={`${FRAME_WIDTH}px`}
          style={{
            // contain, not cover: this is a document's own cover page, and
            // cropping it cut the margins off wider scans and sometimes the
            // title with them. Letterboxing against the paper background reads
            // as a page on a shelf.
            objectFit: "contain",
            objectPosition: "center",
          }}
          onError={() => setLoadError(true)}
        />
      )}
    </div>
  )
}
