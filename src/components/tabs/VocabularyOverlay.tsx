"use client"

// The Concepts and Links Overlays of the Vocabulary tab (model §2 "Overlays",
// §3.4; refactor spec P3.14, ruling 28).
//
// Read-only, anonymous, and gated: the words your section or your cohort
// reached for in the readings YOU have coded. It opens only when asked — your
// own vocabulary is the thing this tab is for, and the comparison is a second
// look at it, never the first.

import { useCallback, useEffect, useState } from "react"

import { getVocabularyOverlay } from "@/lib/reads"
import {
  overlayBlockMessage,
  type OverlayBand,
  type OverlayTerm,
  type VocabularyOverlay as VocabularyOverlayData,
} from "@/lib/overlay"

/** One label, how many people used it, and what they said it meant. */
function TermRow({ term }: { term: OverlayTerm }) {
  return (
    <div className="readitem">
      <div className="trip">
        <b>{term.label}</b>{" "}
        <span className="n">
          {term.count} {term.count === 1 ? "person" : "people"}
        </span>
      </div>
      {term.descriptions.map((description, i) => (
        <div key={i} className="sent">
          &ldquo;{description}&rdquo;
        </div>
      ))}
      {term.moreDescriptions > 0 && (
        <div className="ghostnote">
          + {term.moreDescriptions} more description{term.moreDescriptions !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  )
}

export default function VocabularyOverlay({
  sourceId,
  /** How many passages the student has captured — the gate re-asks when it moves. */
  ownCaptureCount,
}: {
  sourceId: string | null
  ownCaptureCount: number
}) {
  const [band, setBand] = useState<OverlayBand | null>(null)
  const [data, setData] = useState<VocabularyOverlayData | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  /**
   * On, off, or over to the other band. The reset lives here rather than in
   * the effect below: a synchronous setState in an effect body is a cascading
   * render, and PdfViewer's search panel already settled this pattern.
   */
  const toggle = useCallback(
    (next: OverlayBand) => {
      setBusy(band !== next)
      setBand((current) => (current === next ? null : next))
      setData(null)
      setFailed(false)
    },
    [band]
  )

  // Re-runs on `ownCaptureCount` too, so coding the reading opens the gate
  // without a reload. `busy` is set by the handler above rather than here: a
  // synchronous setState in an effect body is a cascading render, and that
  // refresh should be quiet anyway.
  useEffect(() => {
    if (!band) return
    let cancelled = false
    getVocabularyOverlay(sourceId, band)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        // A failed comparison leaves the student's own vocabulary untouched.
        if (!cancelled) {
          setData(null)
          setFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [band, sourceId, ownCaptureCount])

  const setName = data?.band === "cohort" || band === "cohort" ? "your cohort" : "your section"

  return (
    <div className="card" style={{ marginTop: "22px" }}>
      <h2>
        What others named <span className="n">counted, not judged</span>
      </h2>
      <p className="hint">
        The same words other people reached for
        {sourceId ? " in this reading" : " in the readings you have coded"}
        {" "}— no names, and never anyone&apos;s notes or questions. It opens only where you have
        coded the reading yourself, so the crowd cannot name a text for you before you have read it.
      </p>

      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <span className="label">Compare with</span>
        <button
          className={`btn mini ${band === "section" ? "" : "ghost"}`}
          onClick={() => toggle("section")}
          aria-pressed={band === "section"}
          data-tip="the words your discussion section used"
        >
          My section
        </button>
        <button
          className={`btn mini ${band === "cohort" ? "" : "ghost"}`}
          onClick={() => toggle("cohort")}
          aria-pressed={band === "cohort"}
          data-tip="the words everyone on the course used"
        >
          The cohort
        </button>
        {band && busy && <span className="cap">reading {setName}…</span>}
      </div>

      {!band && (
        <p className="ghostnote" style={{ marginTop: "10px" }}>
          Nothing is compared until you ask. Your own concepts and link labels are above.
        </p>
      )}

      {band && failed && (
        <p className="ghostnote" style={{ marginTop: "10px", color: "var(--red)" }}>
          The comparison could not be loaded just now.
        </p>
      )}

      {band && data?.blocked && (
        <p className="ghostnote" style={{ marginTop: "10px" }}>
          {overlayBlockMessage(data.blocked, data.band)}
        </p>
      )}

      {band && data && !data.blocked && (
        <>
          <p className="ghostnote" style={{ marginTop: "10px" }}>
            <b>{data.contributors}</b> of {data.peers} in{" "}
            {data.band === "section" ? "your section" : "your cohort"}{" "}
            {data.contributors === 1 ? "has" : "have"} named something
            {sourceId ? " in this reading" : ` across the ${data.readings} reading${data.readings !== 1 ? "s" : ""} you have coded`}.
            {" "}Counted by the words people typed: two who wrote the same label count as two, and
            nothing here decides whether they meant the same thing.
          </p>

          {data.contributors === 0 ? (
            <p className="empty" style={{ marginTop: "12px" }}>
              Nobody else has named anything here yet.
            </p>
          ) : (
            <div className="two" style={{ marginTop: "14px" }}>
              <div>
                <div className="label">
                  Concepts {data.concepts.length ? `· ${data.concepts.length}` : ""}
                </div>
                <div className="scrollbox" style={{ padding: "10px 12px", marginTop: "6px" }}>
                  {data.concepts.length === 0 && (
                    <p className="empty">No concepts named here yet.</p>
                  )}
                  {data.concepts.map((term) => (
                    <TermRow key={term.label} term={term} />
                  ))}
                </div>
                {data.moreConcepts > 0 && (
                  <p className="ghostnote">
                    + {data.moreConcepts} more label{data.moreConcepts !== 1 ? "s" : ""} beyond the
                    ones shown
                  </p>
                )}
              </div>

              <div>
                <div className="label">
                  Link labels {data.links.length ? `· ${data.links.length}` : ""}
                </div>
                <div className="scrollbox" style={{ padding: "10px 12px", marginTop: "6px" }}>
                  {data.links.length === 0 && (
                    <p className="empty">No link labels coined here yet.</p>
                  )}
                  {data.links.map((term) => (
                    <TermRow key={term.label} term={term} />
                  ))}
                </div>
                {data.moreLinks > 0 && (
                  <p className="ghostnote">
                    + {data.moreLinks} more label{data.moreLinks !== 1 ? "s" : ""} beyond the ones
                    shown
                  </p>
                )}
                {/* Red line #4: an empty state is visible, not filtered away. */}
                {data.unlabeledLinks > 0 && (
                  <p className="ghostnote">
                    {data.unlabeledLinks} link{data.unlabeledLinks !== 1 ? "s" : ""} with no label
                    yet — described, not yet coined.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
