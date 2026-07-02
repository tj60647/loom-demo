"use client"
import { useEffect, useState } from "react"
import dynamic from 'next/dynamic'
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
    refresh()
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

    setInitialPageNumber(target.pageNumber && target.pageNumber > 0 ? target.pageNumber : 1)
    setFocusByteId(target.byteId)
    setActiveSource(resolvedSource)
    onTargetHandled?.()
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
            <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>{s.title}</h3>
            {s.author ? <p className="hint" style={{ margin: "0 0 12px 0" }}>{s.author}</p> : null}
            {s.description ? (
              <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
                {s.description}
              </p>
            ) : null}
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
          </div>
        ))}

      </div>
    </>
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
