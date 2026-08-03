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
import { createOwnReading } from "@/actions/sources"
import { uploadOwnReading } from "@/lib/readingUploadClient"
import { MAX_READING_BYTES, MAX_READING_LABEL, formatBytes } from "@/lib/readingUpload"
import { tallyByReading } from "@/lib/scope"
import SourceThumbnail from "@/components/library/SourceThumbnail"
import ShelfSearch from "@/components/shelf/ShelfSearch"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"
import JourneyNav from "@/components/ui/JourneyNav"

export default function Shelf() {
  // See the note in Workbench: `status` is what distinguishes "nobody is
  // signed in" from "we have not asked yet".
  const { data: session, status } = useSession()
  const { state, isLoading, loadExample, flash } = useLoom()
  const { readings: sources, isLoading: loadingShelf, error, refresh } = useReadings()
  const [exampleBusy, setExampleBusy] = useState(false)
  // The search bar sits behind a toggle, the reading's own ⌕ Search idiom.
  // While a query is live the results own the page; clearing the box — or
  // closing the panel — puts the week-grouped shelf back exactly as it was.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchActive, setSearchActive] = useState(false)

  const tallies = useMemo(() => tallyByReading(state), [state])

  // Syllabus order, with unscheduled readings after the weeks rather than
  // sorted into week 0.
  const courseReadings = useMemo(() => sources.filter((s) => !s.isOwn), [sources])
  const ownReadings = useMemo(() => sources.filter((s) => s.isOwn), [sources])

  const byWeek = useMemo(() => {
    const groups = new Map<number | null, ReadingMeta[]>()
    courseReadings.forEach((s) => {
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
  }, [courseReadings])

  const untethered = state.bytes.filter((b) => !b.sourceId).length

  if (status === "loading") {
    return (
      <>
        <JourneyNav active="readings" />
        <main>
          <div className="empty" style={{ marginTop: "100px" }}>
            <h2>Loading your readings...</h2>
          </div>
        </main>
      </>
    )
  }

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

  const readingCard = (s: ReadingMeta) => {
    const tally = tallies.get(s.id)
    return (
      <Link key={s.id} href={`/reading/${s.id}`} className="shelfcard">
        {s.storageKey ? (
          <SourceThumbnail sourceId={s.id} title={s.title} />
        ) : (
          // No PDF behind this card — say so rather than showing a broken frame.
          <span className="shelfnofile" aria-hidden="true">
            <span className="cap">no pdf</span>
          </span>
        )}
        <div className="shelfbody">
          <div>
            <h3>{s.title}</h3>
            {s.author ? <p className="shelfauthor">{s.author}</p> : null}
            {s.isDescriptionVisible && s.description ? (
              <p className="shelfdesc">{s.description}</p>
            ) : null}
          </div>
          <p className="shelftally">
            {/* Say nothing until the loom has actually loaded: "nothing
                captured here yet" on a full loom is a lie, and it is the
                first thing a student would read on every card. */}
            {isLoading ? (
              <span className="shelfquiet">…</span>
            ) : tally ? (
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
      <JourneyNav active="readings" />
      <main>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", margin: "0 0 3px" }}>
          <p className="tasktitle" style={{ margin: 0 }}>Pick a reading.</p>
          <button
            className={`btn mini tip-below ${searchOpen ? "" : "ghost"}`}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false)
                setSearchActive(false)
              } else {
                setSearchOpen(true)
              }
            }}
            data-tip="find a word or phrase across the readings on your list"
            aria-pressed={searchOpen}
            aria-label="Search your readings"
          >
            ⌕ Search
          </button>
        </div>
        <p className="tasksub">
          Each reading is its own piece of work: capture its passages, name what they
          evidence, thread those concepts together, and read the whole. Your concepts
          carry across — meet one again in a later text and it is the same concept, with
          the evidence of both.
        </p>

        {/* Which reading says this? Words, or a "quoted phrase" — matched
            against every card and every page on your reading list, never
            anyone else's. While a query is live the results stand in for the
            shelf; unmounting on close is what resets the box. */}
        {searchOpen && (
          <ShelfSearch
            onActiveChange={setSearchActive}
            onClose={() => {
              setSearchOpen(false)
              setSearchActive(false)
            }}
          />
        )}

        {!searchActive && (<>
        {/* The whole weave and Keep were quick links here; they are journey
            stations now (05 · 06), so the bar carries them and this row keeps
            only the tally. */}
        <div className="shelfbar">
          <span className="cap shelfcount">
            {isLoading ? "reading your loom…" : (
              <>
                {state.concepts.length} concept{state.concepts.length !== 1 ? "s" : ""} ·{" "}
                {state.bytes.length} passage{state.bytes.length !== 1 ? "s" : ""} ·{" "}
                {state.edges.length} thread{state.edges.length !== 1 ? "s" : ""} in all
              </>
            )}
          </span>
        </div>

        {untethered > 0 && <Untethered readings={sources} />}

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
            <div className="shelfgrid">{readings.map(readingCard)}</div>
          </section>
        ))}

        {/* A reading of the student's own: something they are coding that the
            library does not hold. Reading-first needs every byte to have a
            door, so a self-found paper gets a card rather than becoming an
            untethered passage. */}
        <section style={{ marginBottom: 26 }}>
          <div className="weekhead">
            <span className="cap">your own readings</span>
            <span className="weekrule" />
          </div>
          {ownReadings.length > 0 && (
            <div className="shelfgrid" style={{ marginBottom: 12 }}>{ownReadings.map(readingCard)}</div>
          )}
          <AddOwnReading onAdded={refresh} />
        </section>

        {!isLoading && state.concepts.length === 0 && (
          <div className="card" style={{ marginTop: 8 }}>
            <h2>New to this?</h2>
            <p className="hint">
              A finished weave to poke at — Star &amp; Griesemer, already captured, threaded
              and read. Explore it, then clear it from 06 · Keep to start your own.
            </p>
            <button className="btn ghost mini" onClick={handleLoadExample} disabled={exampleBusy}>
              load the worked example
            </button>
          </div>
        )}
        </>)}

        <FirstRunWalkthrough />
      </main>

      <footer>
        <span className="fl">00 — READINGS</span>
        <span className="fr">PICK A READING</span>
      </footer>
    </>
  )
}

/**
 * Passages with no reading behind them — captured before reading-first, or
 * imported. They are grouped by the citation the student typed and offered a
 * card to belong to.
 *
 * It ASKS. Matching "Suchman, Plans and Situated Actions" against library
 * titles would be the tool deciding what the student meant, and getting it
 * wrong would file someone's evidence under the wrong text (red line #2).
 */
function Untethered({ readings }: { readings: ReadingMeta[] }) {
  const { state, attributeBytes } = useLoom()
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const groups = useMemo(() => {
    const byCitation = new Map<string, string[]>()
    state.bytes.forEach((b) => {
      if (b.sourceId) return
      const key = (b.source ?? "").trim() || " no citation"
      byCitation.set(key, [...(byCitation.get(key) ?? []), b.id])
    })
    return [...byCitation.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [state.bytes])

  if (!groups.length) return null

  const place = async (key: string, ids: string[]) => {
    const sourceId = picked[key]
    if (!sourceId) return
    setBusy(key)
    try {
      await attributeBytes(ids, sourceId)
    } catch {
      // attributeBytes resyncs and flashes; nothing more to say here.
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2>Passages with no reading <span className="n">counted, not corrected</span></h2>
      <p className="hint">
        These were captured before a reading was open, so they sit outside every card on
        your shelf. Say which reading each set came from and they find their place. Loom
        will not guess for you — a wrong guess would file your evidence under the wrong text.
      </p>
      {groups.map(([key, ids]) => (
        <div key={key} className="untethered">
          <div className="untetheredsrc">
            {key === " no citation" ? <i>no citation given</i> : key}
            <span className="n"> · {ids.length} passage{ids.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="quietrow">
            <select
              className="tinput inline"
              value={picked[key] ?? ""}
              onChange={(e) => setPicked((p) => ({ ...p, [key]: e.target.value }))}
            >
              <option value="">which reading?</option>
              {readings.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <button
              className="btn ghost mini nowrapbtn"
              disabled={!picked[key] || busy === key}
              onClick={() => place(key, ids)}
            >
              {busy === key ? "Placing…" : "Place"}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * A reading of the student's own, PDF first: uploaded like any course reading
 * (browser → Blob → register), it gets tab 00 and capture from the text
 * itself. Without a PDF — a book, a lecture — the card still stands, and its
 * passages are captured by hand on 01 · Open. Either way it sits on this
 * student's shelf and nobody else's.
 */
function AddOwnReading({ onAdded }: { onAdded: () => void }) {
  const { flash } = useLoom()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [reference, setReference] = useState("")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  const tooBig = file !== null && file.size > MAX_READING_BYTES

  const reset = () => {
    setFile(null)
    setTitle("")
    setAuthor("")
    setReference("")
    setProgress(null)
  }

  const submit = async () => {
    if (busy || tooBig || (!file && !title.trim())) return
    setBusy(true)
    try {
      if (file) {
        await uploadOwnReading(file, {
          title,
          author,
          sourceReference: reference,
          onPhase: (phase) => setProgress(phase === "sending" ? "sending…" : "extracting…"),
          onProgress: (percent) => setProgress(`sending ${percent}%`),
        })
      } else {
        await createOwnReading({ title, author, sourceReference: reference })
      }
      reset()
      setOpen(false)
      onAdded()
      flash("added to your shelf")
    } catch (e) {
      setProgress(null)
      flash(e instanceof Error ? e.message : "could not add that reading")
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div>
        <button
          className="btn ghost mini"
          onClick={() => setOpen(true)}
          data-tip="upload a PDF you're coding, or card a book or lecture"
        >
          + a reading of your own
        </button>
        <p className="hint" style={{ marginTop: 6 }}>
          Coding something your course readings don&apos;t include? Upload the PDF and it
          reads like any other card — or card a book or lecture and capture by hand.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>A reading of your own</h2>
      <p className="hint">
        With the PDF, the reading opens on 00 and you capture from the text itself.
        Without one — a book, a lecture — the card still stands, and you capture its
        passages by hand on 01 · Open. It sits on your shelf and nobody else&apos;s.
      </p>
      <div className="form-row">
        <span className="label">PDF File <span style={{ textTransform: "none", letterSpacing: 0 }}>(up to {MAX_READING_LABEL} — optional for a book or lecture)</span></span>
        <input
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {tooBig && (
        <p className="hint" style={{ margin: "0 0 8px", color: "var(--red)" }}>
          {formatBytes(file.size)} — over the {MAX_READING_LABEL} limit. Split the
          chapter, or reduce the scan resolution.
        </p>
      )}
      <div className="form-row">
        <span className="label">
          Title{" "}
          {file ? <span style={{ textTransform: "none", letterSpacing: 0 }}>(defaults to the PDF filename)</span> : null}
        </span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Plans and Situated Actions" autoFocus />
      </div>
      <div className="form-row">
        <span className="label">Author <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Suchman" />
      </div>
      <div className="form-row">
        <span className="label">Where it&apos;s from <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cambridge University Press, 1987" />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <button
          className="btn mini"
          onClick={submit}
          disabled={busy || tooBig || (!file && !title.trim())}
          data-tip={
            file
              ? "upload the PDF — it's stored, extracted, and lands on your shelf"
              : "add the card to your shelf — capture its passages by hand"
          }
        >
          {busy ? (progress ?? "Adding…") : "Add to my shelf"}
        </button>
        <button className="btn ghost mini" onClick={() => { reset(); setOpen(false) }} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )
}
