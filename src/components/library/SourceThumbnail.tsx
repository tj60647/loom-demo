"use client"

import { useState } from "react"
import Image from "next/image"

type SourceThumbnailProps = {
  sourceId: string
  title: string
  fixedHeight?: number
}

export default function SourceThumbnail({ sourceId, title, fixedHeight }: SourceThumbnailProps) {
  const [loadError, setLoadError] = useState(false)

  return (
    <div
      style={{
        width: "140px",
        flex: "0 0 140px",
        alignSelf: "stretch",
        ...(fixedHeight ? { height: `${fixedHeight}px` } : { minHeight: "160px" }),
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
          sizes="140px"
          style={{
            objectFit: "cover",
            objectPosition: "top center",
          }}
          onError={() => setLoadError(true)}
        />
      )}
    </div>
  )
}