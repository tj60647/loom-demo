"use client"

// The Concepts and Links Overlays of the Vocabulary tab (model §2 "Overlays",
// §3.4; refactor spec P3.14, ruling 28).
//
// Read-only, anonymous, and faculty-only: the words a section or the cohort
// reached for in the readings YOU have coded. It opens only when asked — your
// own vocabulary is the thing this tab is for, and the comparison is a second
// look at it, never the first.

import { useCallback, useEffect, useState } from "react"

import { getVocabularyOverlay } from "@/lib/reads"
import { useReadings } from "@/components/providers/ReadingsProvider"
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
  /** Which section is being compared; "" means every section — the cohort. */
  const [sectionId, setSectionId] = useState("")
  const [data, setData] = useState<VocabularyOverlayData | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const courseSections = useReadings().course?.sections ?? []

  /**
   * Off, or on to a chosen set. The reset lives here rather than in the effect
   * below: a synchronous setState in an effect body is a cascading render, and
   * PdfViewer's search panel already settled this pattern.
   */
  const toggle = useCallback(
    (next: OverlayBand | null, section = "") => {
      setBusy(!!next)
      setBand(next)
      setSectionId(section)
      setData(null)
      setFailed(false)
    },
    []
  )

  // Re-runs on `ownCaptureCount` too, so coding the reading opens the gate
  // without a reload. `busy` is set by the handler above rather than here: a
  // synchronous setState in an effect body is a cascading render, and that
  // refresh should be quiet anyway.
  useEffect(() => {
    if (!band) return
    let cancelled = false
    getVocabularyOverlay(sourceId, band, sectionId || null)
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
  }, [band, sectionId, sourceId, ownCaptureCount])

  const setName = data?.band === "cohort" || band === "cohort" ? "the cohort" : "that section"

  return (
    <div className="card" style={{ marginTop: "22px" }}>
      <h2>
        What others named <span className="n">counted, not judged</span>
      </h2>
      <p className="hint">
        The same words other people reached for
        {sourceId ? " in this reading" : " across the course's readings"}
        {" "}— no names, and never anyone&apos;s notes or questions. Faculty and admins only:
        a comparison put in front of a student would name the text for them before they had read it.
      </p>

      {/* A picker, not two buttons (TJ, 2026-08-08): faculty teach across
          sections, so a single "my section" had no referent for them. */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <span className="label">Compare with</span>
        <select
          className="tinput inline"
          aria-label="Which section to compare"
          value={band ? sectionId : "off"}
          onChange={(e) => {
            const v = e.target.value
            if (v === "off") { toggle(null); return }
            toggle(v === "all" ? "cohort" : "section", v === "all" ? "" : v)
          }}
        >
          <option value="off">off</option>
          <option value="all">All sections</option>
          {courseSections.map((sec) => (
            <option key={sec.id} value={sec.id}>{sec.name}</option>
          ))}
        </select>
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
            {data.band === "section" ? "that section" : "the cohort"}{" "}
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
                    <p className="empty">No link labels here yet.</p>
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
                    yet — described, not yet labelled.
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
