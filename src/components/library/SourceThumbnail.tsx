"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"

type SourceThumbnailProps = {
  sourceId: string
  title: string
  fixedHeight?: number
}

export default function SourceThumbnail({ sourceId, title, fixedHeight }: SourceThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState(180)
  const [loadError, setLoadError] = useState(false)
  const coverHeight = fixedHeight ?? measuredHeight

  useEffect(() => {
    if (fixedHeight) {
      return
    }

    const element = containerRef.current
    if (!element) return

    const updateHeight = () => {
      const measuredHeight = Math.max(160, Math.floor(element.getBoundingClientRect().height))
      setMeasuredHeight(measuredHeight)
    }

    updateHeight()
    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(element)
    return () => observer.disconnect()
  }, [fixedHeight])

  return (
    <div
      ref={containerRef}
      style={{
        width: "140px",
        minHeight: `${fixedHeight ?? 160}px`,
        alignSelf: "stretch",
        border: "1px solid rgba(26,25,22,.14)",
        borderRadius: "6px",
        background: "linear-gradient(180deg, #f7f4ea 0%, #ece6d7 100%)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 140px",
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
        }}
      />
      {loadError ? (
        <span className="cap" style={{ padding: "12px", textAlign: "center", position: "relative", zIndex: 1 }}>
          Preview unavailable
        </span>
      ) : (
        <div
          style={{
            width: "100%",
            height: `${coverHeight}px`,
            position: "relative",
            zIndex: 1,
          }}
        >
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
        </div>
      )}
    </div>
  )
}