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
import { createOwnReading, updateOwnReadingMetadata } from "@/actions/sources"
import { draftMetadataForOwnSource } from "@/lib/reads"
import { uploadOwnReading } from "@/lib/readingUploadClient"
import { MAX_READING_BYTES, MAX_READING_LABEL, formatBytes } from "@/lib/readingUpload"
import { tallyByReading } from "@/lib/scope"
import { short } from "@/lib/clothMath"
import { timeAgo } from "@/lib/utils"
import SourceThumbnail from "@/components/library/SourceThumbnail"
import ShelfSearch from "@/components/shelf/ShelfSearch"
import GithubSignInButton from "@/components/ui/GithubSignInButton"
import JourneyNav from "@/components/ui/JourneyNav"
import { SIGN_IN_EXPLANATION } from "@/lib/signIn"

export default function Shelf() {
  // See the note in Workbench: `status` is what distinguishes "nobody is
  // signed in" from "we have not asked yet".
  const { data: session, status } = useSession()
  const { state, isLoading } = useLoom()
  const { readings: sources, isLoading: loadingShelf, error, refresh } = useReadings()
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

  const untethered = state.passages.filter((b) => !b.sourceId).length

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
    // The actual front door for most students — the header's button is small
    // and off to one side. One primary action, and the one sentence that
    // prevents the commonest failure: signing in with a GitHub account whose
    // email the roster has never heard of.
    return (
      <main>
        <div
          className="empty"
          style={{ marginTop: "100px", maxWidth: "680px", marginLeft: "auto", marginRight: "auto" }}
        >
          <h2>Welcome to Loom.</h2>
          <span className="cap" style={{ textTransform: "none" }}>{SIGN_IN_EXPLANATION}</span>
          <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
            <GithubSignInButton className="btn" />
          </div>
          {/* The guest door lives on /auth/signin, folded away, and whether it
              is open at all is a server question — so from here it is just a
              quiet way through for the one person who needs it. */}
          <Link href="/auth/signin" className="cap" style={{ display: "inline-block", marginTop: "16px", textTransform: "none" }}>
            no github account?
          </Link>
        </div>
      </main>
    )
  }

  const readingCard = (s: ReadingMeta) => {
    const tally = tallies.get(s.id)
    // 0 or 1 today: the schema's `onePerScope` unique allows exactly one cloth
    // per (user, course, reading). Several per reading is ratified (TJ,
    // 2026-08-08 — a Base Cloth plus "Create new cloth") but NOT built, and it
    // no longer "lands free" here: this card has one door, so several cloths
    // need a rule for which one it opens, and a cloth needs an identity of its
    // own — today it is addressed by scope key, not id. See the model doc.
    const clothsHere = state.cloths.filter((c) => c.scopeKey === s.id)
    // Exactly ONE door per card (TJ, 2026-08-08). "Just read" is a procedure,
    // not a path — you browse inside a cloth without capturing anything — so
    // there is no separate way in that skips the cloth. With a cloth, the card
    // body opens it; without one, the card is inert and Create Cloth is the
    // only act. That also keeps creation explicit: a card click never mints a
    // cloth, it simply does nothing until you have asked for one.
    // The reading card IS the entry point (TJ, 2026-08-08). There is no Create
    // Cloth button any more and no decision to make: one cloth per reading per
    // user, and your Base Cloth is simply there — so opening the reading opens
    // your work on it. The row below is metadata, not a control.
    const cloth = clothsHere[0] ?? null
    const body = (
      <>
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
                  {tally.passages} passage{tally.passages !== 1 ? "s" : ""} ·{" "}
                  {tally.concepts} concept{tally.concepts !== 1 ? "s" : ""} ·{" "}
                  {tally.threads} thread{tally.threads !== 1 ? "s" : ""}
                </>
              ) : (
                <span className="shelfquiet">nothing captured here yet</span>
              )}
            </p>
          </div>
      </>
    )
    return (
      <div key={s.id} className="shelfcard">
        <Link href={`/reading/${s.id}`} className="shelfmain">{body}</Link>
        {/* Metadata, not a control: your name for this work and when you last
            touched it. "Base cloth" until you title it — the cloth is always
            there, so there is nothing here to press. A row only exists once
            something has been written to it, which is why the date is
            conditional. */}
        {!isLoading && (
          <div className="clothrow">
            <span className="clothis">
              <span className="clothname">
                {cloth?.title.trim() ? short(cloth.title, 52) : "Base cloth"}
              </span>
              {cloth ? (
                <span className="clothmeta">
                  {cloth.title.trim() ? "" : "name it · "}edited {timeAgo(cloth.updatedAt)}
                </span>
              ) : (
                <span className="clothmeta">nothing written here yet</span>
              )}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <JourneyNav active="readings" />
      <main>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", margin: "0 0 3px" }}>
          <p className="tasktitle" style={{ margin: 0 }}>Pick a reading.</p>
          <button
            className={`btn mini searchtoggle ${searchOpen ? "" : "ghost"}`}
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
            shelf. Persistent on wide screens (TJ, 2026-08-10): the input is
            always here, Escape clears it; below 900px the button above
            toggles it instead. */}
        <div className={`searchhost${searchOpen ? " open" : ""}`}>
          <ShelfSearch
            onActiveChange={setSearchActive}
            onClose={() => {
              setSearchOpen(false)
              setSearchActive(false)
            }}
          />
        </div>

        {!searchActive && (<>
        {/* The whole weave and Keep were quick links here; they are journey
            stations now (05 · 06), so the bar carries them and this row keeps
            only the tally. */}
        <div className="shelfbar">
          <span className="cap shelfcount">
            {isLoading ? "reading your loom…" : (
              <>
                {state.concepts.length} concept{state.concepts.length !== 1 ? "s" : ""} ·{" "}
                {state.passages.length} passage{state.passages.length !== 1 ? "s" : ""} ·{" "}
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
            library does not hold. Reading-first needs every passage to have a
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

        {/* The worked example used to sit here — a finished weave loaded into
            the student's OWN loom, whose only exit was Keep's reset. Both went
            on 2026-08-11: a tutorial that writes into your real work is the
            problem, and the practice loom is the answer to it (TJ, 2026-08-10:
            "in many games the actual interface is used for the tutorial").
            This is also the first door to `/sandbox` — the student flow has
            drawn a `library → practice` edge since it was built, and until now
            nothing in the app took it. */}
        {!isLoading && state.concepts.length === 0 && (
          <div className="card" style={{ marginTop: 8 }}>
            <h2>New to this?</h2>
            <p className="hint">
              The guide walks you through it on a real reading: highlight a passage,
              name what it evidences, thread two concepts together, lay out a board.
              <b>Nothing there is kept</b>, so nothing you do can go wrong.
            </p>
            <Link className="btn ghost mini" href="/sandbox">open the guide</Link>
          </div>
        )}
        </>)}
      </main>

      <footer>
        <span className="fl">00 — LIBRARY</span>
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
  const { state, attributePassages } = useLoom()
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const groups = useMemo(() => {
    const byCitation = new Map<string, string[]>()
    state.passages.forEach((b) => {
      if (b.sourceId) return
      const key = (b.source ?? "").trim() || "\u0000no citation"
      byCitation.set(key, [...(byCitation.get(key) ?? []), b.id])
    })
    return [...byCitation.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [state.passages])

  if (!groups.length) return null

  const place = async (key: string, ids: string[]) => {
    const sourceId = picked[key]
    if (!sourceId) return
    setBusy(key)
    try {
      await attributePassages(ids, sourceId)
    } catch {
      // attributePassages resyncs and flashes; nothing more to say here.
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
            {key === "\u0000no citation" ? <i>no citation given</i> : key}
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
 * passages are captured by hand on 01 · Reading. Either way it sits on this
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
  // After a PDF upload the form stays open as a review step: the reading is
  // already on the shelf under its filename, and the card's details can be
  // drafted from the PDF itself — reviewed and saved, never auto-applied.
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftNote, setDraftNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [draftProvenance, setDraftProvenance] = useState<string | null>(null)

  const tooBig = file !== null && file.size > MAX_READING_BYTES

  const reset = () => {
    setFile(null)
    setTitle("")
    setAuthor("")
    setReference("")
    setProgress(null)
    setReviewingId(null)
    setDraftNote(null)
    setDraftProvenance(null)
  }

  const close = () => {
    reset()
    setOpen(false)
  }

  const submit = async () => {
    if (busy || tooBig || (!file && !title.trim())) return
    setBusy(true)
    try {
      if (file) {
        const created = await uploadOwnReading(file, {
          title,
          author,
          sourceReference: reference,
          onPhase: (phase) => setProgress(phase === "sending" ? "sending…" : "extracting…"),
          onProgress: (percent) => setProgress(`sending ${percent}%`),
        })
        // On the shelf already — now its card, with the PDF there to draft from.
        setTitle(created.title)
        setFile(null)
        setProgress(null)
        setReviewingId(created.id)
        onAdded()
        flash("on your shelf — now its card")
      } else {
        await createOwnReading({ title, author, sourceReference: reference })
        close()
        onAdded()
        flash("added to your shelf")
      }
    } catch (e) {
      setProgress(null)
      flash(e instanceof Error ? e.message : "could not add that reading")
    } finally {
      setBusy(false)
    }
  }

  const draft = async () => {
    if (!reviewingId || drafting) return
    setDrafting(true)
    setDraftNote(null)
    try {
      const proposal = await draftMetadataForOwnSource(reviewingId)
      // Only overwrite when the model actually found something; an empty
      // field means "not stated on the page", not "clear what you typed".
      if (proposal.title) setTitle(proposal.title)
      if (proposal.author) setAuthor(proposal.author)
      if (proposal.sourceReference) setReference(proposal.sourceReference)
      setDraftProvenance(proposal.provenance)
      setDraftNote({
        kind: "ok",
        text: "Drafted into the fields above — nothing is saved yet. Check every line against the PDF, correct what is wrong, then Save details.",
      })
    } catch (e) {
      setDraftNote({ kind: "err", text: e instanceof Error ? e.message : String(e) })
    } finally {
      setDrafting(false)
    }
  }

  const saveDetails = async () => {
    if (!reviewingId || !title.trim() || busy) return
    setBusy(true)
    try {
      await updateOwnReadingMetadata({
        sourceId: reviewingId,
        title,
        author,
        sourceReference: reference,
        metadataProvenance: draftProvenance ?? undefined,
      })
      close()
      onAdded()
      flash("details saved")
    } catch (e) {
      flash(e instanceof Error ? e.message : "could not save the details")
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

  if (reviewingId) {
    return (
      <div className="card">
        <h2>On your shelf — now its card</h2>
        <p className="hint">
          The reading is uploaded. Draft its details from the PDF itself, or type them —
          either way you review every line, and nothing is saved until you do.
        </p>
        <div className="form-row">
          <span className="label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="form-row">
          <span className="label">Author <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Suchman" />
        </div>
        <div className="form-row">
          <span className="label">Where it&apos;s from <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cambridge University Press, 1987" />
        </div>
        <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
          <button
            type="button"
            className="btn ghost mini nowrapbtn"
            onClick={draft}
            disabled={drafting || busy}
            data-tip="reads the PDF's opening pages and fills the fields above for you to check — saves nothing"
          >
            {drafting ? "Reading the PDF…" : "Draft from PDF"}
          </button>
          {draftNote ? (
            <p className="hint" style={{ margin: 0, color: draftNote.kind === "err" ? "var(--red)" : undefined }}>
              {draftNote.text}
            </p>
          ) : (
            <p className="ghostnote" style={{ margin: 0 }}>
              Proposes title, author and reference from the reading itself. You review and
              save; nothing is kept unread.
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            className="btn mini"
            onClick={saveDetails}
            disabled={busy || drafting || !title.trim()}
            data-tip="save these details to your card"
          >
            {busy ? "Saving…" : "Save details"}
          </button>
          <button
            className="btn ghost mini"
            onClick={close}
            disabled={busy || drafting}
            data-tip="keep the card as it stands"
          >
            Keep as is
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>A reading of your own</h2>
      <p className="hint">
        With the PDF, the reading opens on 00 and you capture from the text itself.
        Without one — a book, a lecture — the card still stands, and you capture its
        passages by hand on 01 · Reading. It sits on your shelf and nobody else&apos;s.
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
