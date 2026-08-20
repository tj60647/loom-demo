"use client"

import { useRef, useState } from "react"
import { uploadReading } from "@/lib/readingUploadClient"
import { MAX_READING_BYTES, MAX_READING_LABEL, formatBytes } from "@/lib/readingUpload"

type UploadReadingsFormProps = {
  /** Offer "also add these to this course" when the admin arrived from one. */
  course?: { id: string; name: string } | null
}

type Phase = "waiting" | "sending" | "reading" | "done" | "failed" | "skipped"

type FileState = {
  file: File
  phase: Phase
  /** 0–100 while the passages are in flight. */
  percent: number
  message?: string
}

const PHASE_LABEL: Record<Phase, string> = {
  waiting: "waiting",
  sending: "sending",
  reading: "extracting",
  done: "added",
  failed: "failed",
  skipped: "skipped",
}

function phaseColor(phase: Phase) {
  if (phase === "done") return "var(--sage)"
  if (phase === "failed") return "var(--red)"
  if (phase === "skipped") return "var(--ochre)"
  return "var(--grey)"
}

export default function UploadReadingsForm({ course }: UploadReadingsFormProps) {
  const [items, setItems] = useState<FileState[]>([])
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const addToCourseRef = useRef<HTMLInputElement>(null)

  const isBatch = items.length > 1
  const tooBig = items.filter((i) => i.file.size > MAX_READING_BYTES)

  const patch = (index: number, next: Partial<FileState>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...next } : it)))

  const pick = (files: FileList | null) => {
    setFinished(false)
    setItems(Array.from(files ?? []).map((file) => ({ file, phase: "waiting" as const, percent: 0 })))
  }

  /**
   * Each reading goes browser → Blob directly, then a short action records it.
   *
   * The passages never pass through a Server Action, so the 4.5MB request-body cap
   * that used to reject most course readings does not apply; the ceiling is now
   * our own MAX_READING_BYTES. Files are handled one at a time so each succeeds,
   * fails and can be retried on its own, and so progress is per reading rather
   * than one opaque wait.
   */
  const startUpload = async () => {
    if (!items.length || running) return
    setRunning(true)
    setFinished(false)

    const titleOverride = items.length === 1 ? (titleRef.current?.value ?? "") : ""
    const addToCourse = addToCourseRef.current?.checked ?? false

    for (let index = 0; index < items.length; index++) {
      const { file } = items[index]

      // Refused here as well as in the token route: failing before the passages
      // move is faster and says something useful, rather than surfacing as a
      // rejected upload halfway through.
      if (file.size > MAX_READING_BYTES) {
        patch(index, {
          phase: "skipped",
          message: `${formatBytes(file.size)} — over the ${MAX_READING_LABEL} limit. Split the chapter, or reduce the scan resolution.`,
        })
        continue
      }

      try {
        patch(index, { phase: "sending", percent: 0 })
        await uploadReading(file, {
          title: titleOverride,
          courseId: addToCourse && course ? course.id : null,
          onPhase: (phase) => patch(index, { phase, percent: phase === "reading" ? 100 : 0 }),
          onProgress: (percent) => patch(index, { percent }),
        })
        patch(index, { phase: "done" })
      } catch (error) {
        patch(index, {
          phase: "failed",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    setRunning(false)
    setFinished(true)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const added = items.filter((i) => i.phase === "done").length
  const unfinished = items.filter((i) => i.phase === "failed" || i.phase === "skipped").length

  return (
    // Folded by default, same idiom as the roster's "Invite learners":
    // uploading is occasional, scanning the library is the daily visit.
    <details className="card invitefold" style={{ marginBottom: "24px" }}>
      <summary>
        <span className="tw">▸</span>
        <h2>Add Readings to the Library</h2>
      </summary>
      <p className="hint" style={{ marginTop: "10px" }}>
        Select one or more PDFs, up to {MAX_READING_LABEL} each. They upload straight from
        your browser to storage, one at a time — each is stored, OCR&apos;d and scored on
        its own, so one bad file never takes the others down. Review titles and
        provenance afterwards.
      </p>

      <div style={{ marginTop: "14px" }}>
        <div className="form-row">
          <span className="label">PDF Files</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            disabled={running}
            onChange={(event) => pick(event.target.files)}
          />
        </div>

        {items.length > 0 && (
          <p className="hint" style={{ margin: "6px 0 0" }}>
            {items.length} file{items.length === 1 ? "" : "s"} selected
            {isBatch ? " — each reading takes its filename as the title" : ""}
          </p>
        )}

        {tooBig.length > 0 && (
          <p className="hint" style={{ margin: "6px 0 0", color: "var(--red)" }}>
            {tooBig.length} file{tooBig.length === 1 ? " is" : "s are"} over the{" "}
            {MAX_READING_LABEL} limit and will be skipped:{" "}
            {tooBig.map((i) => `${i.file.name} (${formatBytes(i.file.size)})`).join(", ")}.
          </p>
        )}

        {!isBatch && (
          <div className="form-row" style={{ marginTop: "10px" }}>
            <span className="label">Title Override (Optional)</span>
            <input ref={titleRef} placeholder="Defaults to the PDF filename" />
          </div>
        )}

        {course && (
          <label
            className="hint"
            style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}
          >
            <input ref={addToCourseRef} type="checkbox" defaultChecked />
            Also include them in {course.name}
          </label>
        )}

        <button
          className="btn mini"
          style={{ marginTop: "12px" }}
          type="button"
          onClick={startUpload}
          disabled={running || !items.length}
          data-tip="Send the selected PDFs to the library — each is stored, extracted, and scored on its own"
        >
          {running
            ? `Uploading ${Math.min(added + unfinished + 1, items.length)} of ${items.length}…`
            : `Upload ${items.length > 1 ? `${items.length} Readings` : "Reading"}`}
        </button>
      </div>

      {/* Per-file state, live. A partial batch is the normal outcome, so this
          shows what landed and exactly what still needs attention. */}
      {items.length > 0 && (
        <ul aria-live="polite" style={{ margin: "14px 0 0", padding: 0, listStyle: "none" }}>
          {items.map((item) => (
            <li
              key={item.file.name}
              className="hint"
              style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline", padding: "3px 0", fontSize: "13px" }}
            >
              <span style={{ fontFamily: "var(--mono)", fontSize: "11px", minWidth: "76px", color: phaseColor(item.phase) }}>
                {item.phase === "sending" ? `${item.percent}%` : PHASE_LABEL[item.phase]}
              </span>
              <span style={{ fontFamily: "var(--mono)", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                {item.file.name}
              </span>
              <span style={{ color: "var(--grey)", fontSize: "11px" }}>{formatBytes(item.file.size)}</span>
              {item.message && (
                <span style={{ color: phaseColor(item.phase), flexBasis: "100%", fontSize: "12px" }}>
                  {item.message}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {finished && (
        <p className="hint" style={{ marginTop: "10px", color: unfinished ? "var(--red)" : "var(--sage)" }}>
          {added} of {items.length} added
          {unfinished ? ` — ${unfinished} still to deal with.` : "."}
        </p>
      )}
    </details>
  )
}
