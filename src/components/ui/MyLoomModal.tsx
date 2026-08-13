"use client"

/**
 * My Loom — what you have made, and the way out of it.
 *
 * TJ, 2026-08-13: "should there be a 'my loom' modal with this? between about
 * and workflows?" Yes, and the slot is the argument. A whole-loom operation
 * had nowhere to live once Keep was deleted, and the alternative — a station,
 * a tab — is the thing that was deleted. This is chrome, like About beside it,
 * and it is on every page for the same reason the guide is.
 *
 * IT IS A MIRROR AND AN EXIT, NEVER A WORKSHOP. Downloads happen AT THE OBJECT
 * (docs/keep-at-the-object.md); the moment this modal grows a download button
 * it has reconstituted Keep through the window. So every count here is either
 * a door to where that work lives or a plain number, and the only verb in the
 * whole dialog is start over.
 *
 * The counts come from `state`, the whole graph the provider already holds —
 * no read of its own, so opening this cannot disagree with the workbench
 * behind it.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import { scopeFromKey } from "@/lib/scope"

/** What a student types to arm the reset. Deliberately the label on the button. */
const CONFIRM_PHRASE = "start over"

/**
 * "1 thread", not "1 threads".
 *
 * The totals row got this right by hand and the confirm sentence did not, so
 * the dialog counted correctly and then read "1 threads" at the one moment a
 * student is being asked to weigh what they are about to lose. One helper for
 * both, so they cannot drift again.
 */
const noun = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)
const count = (n: number, one: string, many = `${one}s`) => `${n} ${noun(n, one, many)}`

export default function MyLoomModal({
  onClose,
  /**
   * The practice loom hides start over: the counts behind it are the REAL
   * loom's (the Header sits above SandboxLoomProvider, so it reads the real
   * one), and offering to clear them from a page that promises nothing is kept
   * is a sentence no student should have to untangle.
   */
  allowReset,
}: {
  onClose: () => void
  allowReset: boolean
}) {
  const { state, resetLoom, flash } = useLoom()
  const { titleOf } = useReadings()
  const [arming, setArming] = useState(false)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const typeRef = useRef<HTMLInputElement>(null)

  /**
   * The keyboard manners the app's own confirm already has
   * ([DialogProvider](../providers/DialogProvider.tsx)): focus lands inside,
   * Escape closes, Tab stays. `aria-modal` is a claim, and without these it is
   * a false one — focus walks out into the page behind while a screen reader
   * has been told the rest of the app is inert.
   *
   * Nothing is auto-focused in the summary: the only button here is
   * destructive, and DialogProvider's rule — never let a stray Enter land on
   * the delete — applies before the dialog is armed as much as after. Focus
   * goes to the PANEL, so the first Tab reaches Close. Once armed, the field
   * takes focus because typing is the required next act, and the phrase is
   * itself the guard against a careless Enter.
   */
  useEffect(() => {
    if (arming) typeRef.current?.focus()
    else panelRef.current?.focus()
  }, [arming])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A reset in flight is not interruptible — closing the dialog would not
      // recall the request, only hide whether it landed.
      if (busy) return
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === "Tab" && panelRef.current) {
        // Wider than DialogProvider's button-only sweep: this dialog also
        // holds reading links and the confirm field.
        const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled)"
        )]
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [busy, onClose])

  const total =
    state.concepts.length + state.passages.length + state.edges.length +
    state.links.length + state.maps.length + state.cloths.length

  /**
   * The work grouped by the reading it belongs to — the only grouping that can
   * honestly be a door, since a reading is the one surface left that holds a
   * cloth. Passages carry `sourceId` outright; cloths and projections carry a
   * `scopeKey`, which for a reading is that reading's id.
   *
   * Concepts and Links are absent on purpose. They are user-level — "a concept
   * does not belong to a text; a passage does" (About) — so filing them under
   * a reading here would teach the opposite of what the model says.
   */
  const byReading = useMemo(() => {
    const rows = new Map<string, { passages: number; cloths: number; maps: number }>()
    const at = (id: string) => {
      const row = rows.get(id) ?? { passages: 0, cloths: 0, maps: 0 }
      rows.set(id, row)
      return row
    }
    state.passages.forEach((p) => { if (p.sourceId) at(p.sourceId).passages += 1 })
    state.cloths.forEach((c) => {
      const only = scopeFromKey(c.scopeKey).sourceIds
      if (only.length === 1) at(only[0]).cloths += 1
    })
    state.maps.forEach((m) => {
      const only = scopeFromKey(m.scopeKey).sourceIds
      if (only.length === 1) at(only[0]).maps += 1
    })
    return [...rows.entries()]
      .map(([id, row]) => ({ id, title: titleOf(id), ...row }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [state.passages, state.cloths, state.maps, titleOf])

  /** Captured before any reading was named — real work with no door yet. */
  const unplaced = state.passages.filter((p) => !p.sourceId).length

  const doReset = async () => {
    setBusy(true)
    setError(null)
    try {
      const counts = await resetLoom()
      const cleared = counts.passages + counts.concepts + counts.edges
      flash(cleared ? "your loom is empty — the log kept the record" : "nothing to clear")
      onClose()
    } catch (e) {
      // Stay open and say so. A failed reset that closed the dialog would look
      // exactly like a successful one until the next reload.
      setError(e instanceof Error ? e.message : "could not start over — nothing was cleared")
      setBusy(false)
    }
  }

  return (
    <div className="info-scrim" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div
        className="info-dialog myloombox"
        role="dialog"
        aria-modal="true"
        aria-label="My Loom"
        ref={panelRef}
        // Focusable as a container so the dialog itself can hold focus on
        // open without putting it on the one destructive control.
        tabIndex={-1}
      >
        <button className="btn ghost mini info-close" onClick={onClose} disabled={busy} aria-label="Close">✕</button>

        <span className="info-k">my loom</span>
        <h2>What you have made</h2>

        {total === 0 ? (
          <p className="info-note">
            Nothing yet. Open a reading from the Library and capture the first passage
            worth keeping — or walk the whole thing in the guide, where nothing is kept.
          </p>
        ) : (
          <>
            <ul className="myloom-totals">
              {([
                [state.passages.length, "passage"], [state.concepts.length, "concept"],
                [state.edges.length, "thread"], [state.links.length, "link"],
                [state.maps.length, "projection"], [state.cloths.length, "cloth"],
              ] as const).map(([n, word]) => (
                <li key={word}><b>{n}</b> {noun(n, word)}</li>
              ))}
            </ul>
            <p className="info-note">
              Concepts and links are yours across every reading — a concept does not
              belong to a text, a passage does. Each object downloads where it lives.
            </p>

            {byReading.length > 0 && (
              <>
                <h3>Where it lives</h3>
                <ul className="myloom-readings">
                  {byReading.map((r) => (
                    <li key={r.id}>
                      <Link href={`/reading/${r.id}`} onClick={onClose}>{r.title}</Link>
                      <small>
                        {[
                          r.passages && count(r.passages, "passage"),
                          r.cloths && "a cloth",
                          r.maps && count(r.maps, "projection"),
                        ].filter(Boolean).join(" · ")}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {unplaced > 0 && (
              <p className="info-note">
                {unplaced} {unplaced === 1 ? "passage has" : "passages have"} no reading yet —
                say which text {unplaced === 1 ? "it came" : "they came"} from at 01 and{" "}
                {unplaced === 1 ? "it gets" : "they get"} a door.
              </p>
            )}
          </>
        )}

        {allowReset && (
          <div className="myloom-danger">
            <h3>Start over</h3>
            {!arming ? (
              <>
                <p>
                  Clears everything above — every passage, concept, link, thread,
                  projection and cloth in this course. Your readings stay, and so does
                  your place on the course.
                </p>
                <p className="info-note">
                  Your Capture Log keeps the record of the weaving, and your instructor
                  can see it. Download anything you want to keep first — each object
                  downloads from its own row.
                </p>
                <button
                  className="btn danger"
                  onClick={() => setArming(true)}
                  disabled={total === 0}
                >
                  Start over
                </button>
                {total === 0 && <small className="myloom-hint">Nothing to clear.</small>}
              </>
            ) : (
              <>
                <p>
                  This removes <b>{count(state.passages.length, "passage")}</b>,{" "}
                  <b>{count(state.concepts.length, "concept")}</b>,{" "}
                  <b>{count(state.links.length, "link")}</b>,{" "}
                  <b>{count(state.edges.length, "thread")}</b>,{" "}
                  <b>{count(state.maps.length, "projection")}</b> and{" "}
                  <b>{count(state.cloths.length, "cloth")}</b>. It cannot be undone from here.
                </p>
                <label className="myloom-type">
                  Type <b>{CONFIRM_PHRASE}</b> to confirm
                  <input
                    ref={typeRef}
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`Type ${CONFIRM_PHRASE} to confirm`}
                  />
                </label>
                {error && <p className="myloom-error">{error}</p>}
                <div className="myloom-actions">
                  {/* Cancel first and Cancel plain: the destructive button is
                      never the one a hurried hand lands on. */}
                  <button
                    className="btn ghost"
                    onClick={() => { setArming(false); setTyped(""); setError(null) }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn danger"
                    onClick={doReset}
                    disabled={busy || typed.trim().toLowerCase() !== CONFIRM_PHRASE}
                  >
                    {busy ? "Clearing…" : "Clear my loom"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
