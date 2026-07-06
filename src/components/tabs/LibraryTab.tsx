"use client"
import { useEffect, useRef, useState } from "react"
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useSession } from "next-auth/react"
import { getSources, createSource } from "@/actions/sources"
import type { Source } from "@/lib/types"

const PdfViewer = dynamic(() => import('@/components/pdf/PdfViewer'), {
  ssr: false,
})

type LibraryNavTarget = {
  byteId: string
  sourceId: string | null
  sourceName: string | null
  pageNumber: number | null
}

type LibraryTabProps = {
  target?: LibraryNavTarget | null
  onTargetHandled?: () => void
  onGotoOpenByte?: (byteId: string) => void
}

export default function LibraryTab({ target, onTargetHandled, onGotoOpenByte }: LibraryTabProps) {
  const { data: session } = useSession()
  const [activeSource, setActiveSource] = useState<Source | null>(null)
  const [initialPageNumber, setInitialPageNumber] = useState<number>(1)
  const [focusByteId, setFocusByteId] = useState<string | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = session?.user?.role === "ADMIN"

  const refresh = () => {
    setIsLoading(true)
    getSources()
      .then(setSources)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load library"))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      refresh()
    }, 0)

    return () => window.clearTimeout(handle)
  }, [])

  useEffect(() => {
    if (!target) return
    if (sources.length === 0) return

    const resolvedSource = target.sourceId
      ? sources.find((s) => s.id === target.sourceId)
      : target.sourceName
        ? sources.find((s) => s.title === target.sourceName)
        : undefined

    if (!resolvedSource) {
      onTargetHandled?.()
      return
    }

    const handle = window.setTimeout(() => {
      setInitialPageNumber(target.pageNumber && target.pageNumber > 0 ? target.pageNumber : 1)
      setFocusByteId(target.byteId)
      setActiveSource(resolvedSource)
      onTargetHandled?.()
    }, 0)

    return () => window.clearTimeout(handle)
  }, [onTargetHandled, sources, target])

  if (activeSource) {
    return (
      <PdfViewer 
        url={`/api/readings/${activeSource.id}`}
        sourceName={activeSource.title}
        sourceId={activeSource.id}
        initialPageNumber={initialPageNumber}
        focusByteId={focusByteId}
        onGotoOpenByte={onGotoOpenByte}
        onClose={() => {
          setActiveSource(null)
          setInitialPageNumber(1)
          setFocusByteId(null)
        }} 
      />
    )
  }

  return (
    <>
      <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {isAdmin && <UploadSourceForm onUploaded={refresh} />}

        {isLoading && <p className="hint">Loading library…</p>}
        {error && <p className="hint" style={{ color: "var(--red)" }}>{error}</p>}
        {!isLoading && !error && sources.length === 0 && (
          <p className="hint">No readings in the library yet.</p>
        )}

        {sources.map((s) => (
          <div className="card" key={s.id} style={{ padding: "20px" }}>
            <div style={{ display: "flex", gap: "18px", alignItems: "stretch", flexWrap: "wrap" }}>
              <PdfThumbnail source={s} />
              <div style={{ flex: "1 1 340px", minWidth: "240px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>{s.title}</h3>
                  {s.author ? <p className="hint" style={{ margin: "0 0 12px 0" }}>{s.author}</p> : null}
                  {s.description ? (
                    <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
                      {s.description}
                    </p>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    className="btn mini"
                    onClick={() => {
                      setInitialPageNumber(1)
                      setFocusByteId(null)
                      setActiveSource(s)
                    }}
                  >
                    Read in Loom
                  </button>
                  <a
                    className="btn ghost mini"
                    href={`/api/readings/${s.id}?download=1`}
                  >
                    Download PDF
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}

      </div>
    </>
  )
}

function PdfThumbnail({ source }: { source: Source }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [coverHeight, setCoverHeight] = useState(180)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateHeight = () => {
      const measuredHeight = Math.max(160, Math.floor(element.getBoundingClientRect().height))
      setCoverHeight(measuredHeight)
    }

    updateHeight()
    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: "140px",
        minHeight: "160px",
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
        <span className="cap" style={{ padding: "12px", textAlign: "center" }}>Preview unavailable</span>
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
            alt={`Preview of ${source.title}`}
            src={`/api/readings/${source.id}/cover`}
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

function UploadSourceForm({ onUploaded }: { onUploaded: () => void }) {
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [description, setDescription] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!title || !file) return
    setIsSubmitting(true)
    setError(null)
    try {
      await createSource({ title, author, description, file })
      setTitle("")
      setAuthor("")
      setDescription("")
      setFile(null)
      onUploaded()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload reading")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="card" style={{ padding: "20px" }}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Add a Reading</h3>
      <div className="form-row">
        <span className="label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Designing Engineers" />
      </div>
      <div className="form-row" style={{ marginTop: "10px" }}>
        <span className="label">Author</span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Bucciarelli" />
      </div>
      <div className="form-row" style={{ marginTop: "10px" }}>
        <span className="label">Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short blurb" />
      </div>
      <div className="form-row" style={{ marginTop: "10px" }}>
        <span className="label">PDF File</span>
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      {error && <p className="hint" style={{ color: "var(--red)" }}>{error}</p>}
      <button
        className="btn mini"
        style={{ marginTop: "12px" }}
        disabled={!title || !file || isSubmitting}
        onClick={handleSubmit}
      >
        {isSubmitting ? "Uploading…" : "Upload Reading"}
      </button>
    </div>
  )
}
