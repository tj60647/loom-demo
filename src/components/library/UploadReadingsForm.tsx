"use client"

import { useActionState, useRef, useState } from "react"
import { createSourcesFromForm, type UploadOutcome } from "@/actions/sources"

type UploadReadingsFormProps = {
  /** Offer "also add these to this course" when the admin arrived from one. */
  course?: { id: string; name: string } | null
}

const INITIAL: UploadOutcome | null = null

export default function UploadReadingsForm({ course }: UploadReadingsFormProps) {
  const [outcome, formAction, isPending] = useActionState(createSourcesFromForm, INITIAL)
  const [selected, setSelected] = useState<File[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  // A title override applies to one reading. With a batch, each takes its
  // filename, so the field would be a lie — hide it rather than ignore it.
  const isBatch = selected.length > 1

  return (
    <section className="card" style={{ marginBottom: "24px" }}>
      <h2>Add Readings to the Library</h2>
      <p className="hint" style={{ marginTop: "8px" }}>
        Select one or more PDFs. Each is stored, OCR&apos;d, and scored for extraction
        quality on upload. Review titles and provenance afterwards.
      </p>

      <form
        ref={formRef}
        action={(formData) => {
          formAction(formData)
          setSelected([])
          formRef.current?.reset()
        }}
        style={{ marginTop: "14px" }}
      >
        <input type="hidden" name="courseId" value={course?.id ?? ""} />

        <div className="form-row">
          <span className="label">PDF Files</span>
          <input
            name="files"
            type="file"
            accept="application/pdf"
            multiple
            required
            onChange={(event) => setSelected(Array.from(event.target.files ?? []))}
          />
        </div>

        {selected.length > 0 ? (
          <p className="hint" style={{ margin: "6px 0 0" }}>
            {selected.length} file{selected.length === 1 ? "" : "s"} selected
            {isBatch ? " — each reading takes its filename as the title" : ""}
          </p>
        ) : null}

        {!isBatch ? (
          <div className="form-row" style={{ marginTop: "10px" }}>
            <span className="label">Title Override (Optional)</span>
            <input name="title" placeholder="Defaults to the PDF filename" />
          </div>
        ) : null}

        {course ? (
          <label
            className="hint"
            style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}
          >
            <input type="checkbox" name="addToCourse" defaultChecked />
            Also include them in {course.name}
          </label>
        ) : null}

        <button className="btn mini" style={{ marginTop: "12px" }} type="submit" disabled={isPending}>
          {isPending
            ? "Uploading…"
            : `Upload ${selected.length > 1 ? `${selected.length} Readings` : "Reading"}`}
        </button>
      </form>

      {/* A partial batch is the normal failure mode, so report both halves:
          what landed, and exactly which files need re-uploading. */}
      <div aria-live="polite">
        {outcome && outcome.uploaded > 0 ? (
          <p className="hint" style={{ marginTop: "12px", color: "var(--sage)" }}>
            Uploaded {outcome.uploaded} reading{outcome.uploaded === 1 ? "" : "s"}.
          </p>
        ) : null}

        {outcome && outcome.failures.length > 0 ? (
          <div style={{ marginTop: "10px" }}>
            <p className="hint" style={{ margin: 0, color: "var(--red)" }}>
              {outcome.failures.length} file{outcome.failures.length === 1 ? "" : "s"} failed —
              the rest were added:
            </p>
            <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
              {outcome.failures.map((failure) => (
                <li key={failure.filename} className="hint" style={{ fontSize: "13px" }}>
                  <span style={{ fontFamily: "var(--mono)" }}>{failure.filename}</span> —{" "}
                  {failure.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}
