"use client"

// The shelf — the home screen, and the course itself.
//
// `course_source` already carries week / core / visibility, so grouping by week
// IS the syllabus (deployment notes §4: two core readings a week, weeks 2-13).
// Each card carries the student's own counts for that reading. Counted, never
// scored: no completion, no checkmarks, no "not started" — red line #7 holds
// only if the shelf reports what the student did and never grades it.

import { useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings, type ReadingMeta } from "@/components/providers/ReadingsProvider"
import { tallyByReading } from "@/lib/scope"
import SourceThumbnail from "@/components/library/SourceThumbnail"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"

export default function Shelf() {
  const { data: session } = useSession()
  const { state, isLoading, loadExample, flash } = useLoom()
  const { readings: sources, isLoading: loadingShelf, error } = useReadings()
  const [exampleBusy, setExampleBusy] = useState(false)

  const tallies = useMemo(() => tallyByReading(state), [state])

  // Syllabus order, with unscheduled readings after the weeks rather than
  // sorted into week 0.
  const byWeek = useMemo(() => {
    const groups = new Map<number | null, ReadingMeta[]>()
    sources.forEach((s) => {
      const list = groups.get(s.week) ?? []
      list.push(s)
      groups.set(s.week, list)
    })
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === b) return 0
      if (a === null) return 1
      if (b === null) return -1
      return a - b
    })
  }, [sources])

  const untethered = state.bytes.filter((b) => !b.sourceId).length

  if (!session) {
    return (
      <main>
        <div className="empty" style={{ marginTop: "100px" }}>
          <h2>Welcome to Loom.</h2>
          <span className="cap">Please sign in to continue</span>
        </div>
        <FirstRunWalkthrough autoOpen={false} />
      </main>
    )
  }

  const handleLoadExample = async () => {
    setExampleBusy(true)
    try {
      await loadExample()
    } catch (e) {
      flash(e instanceof Error ? e.message : "could not load the example")
    } finally {
      setExampleBusy(false)
    }
  }

  return (
    <>
      <main>
        <p className="tasktitle">Pick a reading.</p>
        <p className="tasksub">
          Each reading is its own piece of work: capture its passages, name what they
          evidence, thread those concepts together, and read the whole. Your concepts
          carry across — meet one again in a later text and it is the same concept, with
          the evidence of both.
        </p>

        <div className="shelfbar">
          <Link className="btn ghost mini" href="/weave">Your whole weave →</Link>
          <Link className="btn ghost mini" href="/keep">05 · Keep — export, import, reset</Link>
          <span className="cap shelfcount">
            {state.concepts.length} concept{state.concepts.length !== 1 ? "s" : ""} ·{" "}
            {state.bytes.length} passage{state.bytes.length !== 1 ? "s" : ""} ·{" "}
            {state.edges.length} thread{state.edges.length !== 1 ? "s" : ""} in all
          </span>
        </div>

        {untethered > 0 && (
          <p className="ghostnote" style={{ marginBottom: 14 }}>
            {untethered} passage{untethered !== 1 ? "s" : ""} not tied to a reading —{" "}
            they live in <Link href="/weave">your whole weave</Link>, and you can say which
            reading each came from from there.
          </p>
        )}

        {loadingShelf && <p className="hint">Reading the shelf…</p>}
        {error && <p className="hint" style={{ color: "var(--red)" }}>{error}</p>}

        {!loadingShelf && !error && sources.length === 0 && (
          <div className="empty">
            <span className="cap">no readings published to your course yet</span>
          </div>
        )}

        {byWeek.map(([week, readings]) => (
          <section key={week ?? "none"} style={{ marginBottom: 26 }}>
            <div className="weekhead">
              <span className="cap">{week === null ? "unscheduled" : `week ${week}`}</span>
              <span className="weekrule" />
            </div>
            <div className="shelfgrid">
              {readings.map((s) => {
                const tally = tallies.get(s.id)
                return (
                  <Link key={s.id} href={`/reading/${s.id}`} className="shelfcard">
                    <SourceThumbnail sourceId={s.id} title={s.title} />
                    <div className="shelfbody">
                      <div>
                        <h3>{s.title}</h3>
                        {s.author ? <p className="shelfauthor">{s.author}</p> : null}
                        {s.isDescriptionVisible && s.description ? (
                          <p className="shelfdesc">{s.description}</p>
                        ) : null}
                      </div>
                      <p className="shelftally">
                        {tally ? (
                          <>
                            {tally.bytes} byte{tally.bytes !== 1 ? "s" : ""} ·{" "}
                            {tally.concepts} concept{tally.concepts !== 1 ? "s" : ""} ·{" "}
                            {tally.threads} thread{tally.threads !== 1 ? "s" : ""}
                          </>
                        ) : (
                          <span className="shelfquiet">nothing captured here yet</span>
                        )}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}

        {!isLoading && state.concepts.length === 0 && (
          <div className="card" style={{ marginTop: 8 }}>
            <h2>New to this?</h2>
            <p className="hint">
              A finished weave to poke at — Star &amp; Griesemer, already captured, threaded
              and read. Explore it, then clear it from 05 · Keep to start your own.
            </p>
            <button className="btn ghost mini" onClick={handleLoadExample} disabled={exampleBusy}>
              load the worked example
            </button>
          </div>
        )}

        <FirstRunWalkthrough />
      </main>

      <footer>
        <span className="fl">THE SHELF</span>
        <span className="fr">PICK A READING</span>
      </footer>
    </>
  )
}
