"use client"
import { useEffect, useState } from "react"
import dynamic from 'next/dynamic'
import { useSession } from "next-auth/react"
import { getSources } from "@/actions/sources"
import { uploadReading } from "@/lib/readingUploadClient"
import { MAX_READING_LABEL } from "@/lib/readingUpload"
import type { Source } from "@/lib/types"
import SourceThumbnail from "@/components/library/SourceThumbnail"

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
              <SourceThumbnail sourceId={s.id} title={s.title} />
              <div style={{ flex: "1 1 340px", minWidth: "240px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>{s.title}</h3>
                  {s.author ? <p className="hint" style={{ margin: "0 0 12px 0" }}>{s.author}</p> : null}
                  {s.sourceReference ? (
                    <p className="hint" style={{ margin: s.author ? "-6px 0 12px 0" : "0 0 12px 0", fontSize: "13px" }}>
                      {s.sourceReference}
                    </p>
                  ) : null}
                  {s.isDescriptionVisible && s.description ? (
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

function UploadSourceForm({ onUploaded }: { onUploaded: () => void }) {
  const [title, setTitle] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failures, setFailures] = useState<{ filename: string; message: string }[]>([])

  const isSubmitting = progress !== null
  // A title override names one reading; in a batch each takes its filename.
  const isBatch = files.length > 1

  const handleSubmit = async () => {
    if (files.length === 0) return
    setProgress({ done: 0, total: files.length })
    setFailures([])

    // Sequential and independent, matching the admin path: one bad PDF fails on
    // its own and is named, rather than discarding the rest of the batch.
    const failed: { filename: string; message: string }[] = []
    for (const [index, file] of files.entries()) {
      try {
        // Browser → Blob, same as the admin form: a Server Action body is
        // capped at 4.5MB on Vercel and course readings routinely exceed it.
        await uploadReading(file, { title: isBatch ? "" : title })
      } catch (e) {
        failed.push({
          filename: file.name,
          message: e instanceof Error ? e.message : "Failed to upload reading",
        })
      }
      setProgress({ done: index + 1, total: files.length })
    }

    setFailures(failed)
    setTitle("")
    setFiles([])
    setProgress(null)
    onUploaded()
  }

  return (
    <div className="card" style={{ padding: "20px" }}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Add Readings</h3>
      <p className="hint" style={{ margin: "0 0 12px 0" }}>
        Upload one or more PDFs, up to {MAX_READING_LABEL} each. Review and approve metadata in Library Manager.
      </p>
      {!isBatch && (
        <div className="form-row">
          <span className="label">Title Override (Optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the PDF filename" />
        </div>
      )}
      <div className="form-row" style={{ marginTop: "10px" }}>
        <span className="label">PDF Files</span>
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </div>
      {files.length > 0 && !isSubmitting && (
        <p className="hint" style={{ margin: "6px 0 0" }}>
          {files.length} file{files.length === 1 ? "" : "s"} selected
        </p>
      )}
      {failures.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: "18px" }}>
          {failures.map((failure) => (
            <li key={failure.filename} className="hint" style={{ color: "var(--red)", fontSize: "13px" }}>
              <span style={{ fontFamily: "var(--mono)" }}>{failure.filename}</span> — {failure.message}
            </li>
          ))}
        </ul>
      )}
      <button
        className="btn mini"
        style={{ marginTop: "12px" }}
        disabled={files.length === 0 || isSubmitting}
        onClick={handleSubmit}
      >
        {progress
          ? `Uploading ${progress.done + 1}/${progress.total}…`
          : `Upload ${files.length > 1 ? `${files.length} Readings` : "Reading"}`}
      </button>
    </div>
  )
}
