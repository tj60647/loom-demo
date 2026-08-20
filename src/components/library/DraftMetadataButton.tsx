"use client"

import { useRef, useState } from "react"
import { draftMetadataForSource } from "@/lib/reads"

/**
 * Fills the edit form with a draft read off the PDF, for the instructor to
 * check and save.
 *
 * The button deliberately does not save. Red line #6 admits this model call
 * only because an instructor reads every field before a student can see it
 * (see src/lib/metadataDraft.ts) — so this writes to the form, never the
 * database, and says so on screen.
 *
 * It sets the sibling inputs' values directly rather than owning them as React
 * state: the form around it is a server-action form with uncontrolled inputs,
 * and this keeps that intact instead of rebuilding it as a client form.
 */
export default function DraftMetadataButton({ sourceId }: { sourceId: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const run = async () => {
    setBusy(true)
    setNote(null)
    try {
      const draft = await draftMetadataForSource(sourceId)
      const form = buttonRef.current?.closest("form")
      if (!form) throw new Error("Could not find the edit form to fill.")

      const fill = (name: string, value: string) => {
        const field = form.elements.namedItem(name)
        // Only overwrite when the model actually found something; an empty
        // field means "not stated on the page", not "clear what you typed".
        if (value && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
          field.value = value
        }
      }
      fill("title", draft.title)
      fill("author", draft.author)
      fill("sourceReference", draft.sourceReference)
      fill("description", draft.description)
      fill("metadataProvenance", draft.provenance)

      setNote({
        kind: "ok",
        text: "Drafted into the fields above — nothing is saved yet. Check every line against the PDF, correct what is wrong, then Save Metadata.",
      })
    } catch (error) {
      setNote({ kind: "err", text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: "6px", justifyItems: "start" }}>
      <button
        ref={buttonRef}
        type="button"
        className="btn ghost mini nowrapbtn"
        onClick={run}
        disabled={busy}
        data-tip="reads the PDF's opening pages and fills the fields above for you to check — saves nothing"
      >
        {busy ? "Reading the PDF…" : "Draft from PDF"}
      </button>
      {note && (
        <p className="hint" style={{ margin: 0, color: note.kind === "err" ? "var(--red)" : undefined }}>
          {note.text}
        </p>
      )}
      {!note && (
        <p className="ghostnote" style={{ margin: 0 }}>
          Proposes title, author, reference and description from the reading itself. You review and save; nothing reaches a student unread.
        </p>
      )}
    </div>
  )
}
