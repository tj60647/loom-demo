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
import { useRouter } from "next/navigation"
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
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"
import GithubSignInButton from "@/components/ui/GithubSignInButton"
import JourneyNav from "@/components/ui/JourneyNav"
import { SIGN_IN_EXPLANATION } from "@/lib/signIn"

export default function Shelf() {
  // See the note in Workbench: `status` is what distinguishes "nobody is
  // signed in" from "we have not asked yet".
  const { data: session, status } = useSession()
  const { state, isLoading, loadExample, flash, updateCloth } = useLoom()
  const { readings: sources, isLoading: loadingShelf, error, refresh } = useReadings()
  const router = useRouter()
  const [exampleBusy, setExampleBusy] = useState(false)
  // The reading whose Create Cloth is in flight, so double-clicks and a second
  // card's button both wait for the first create to land.
  const [creatingClothFor, setCreatingClothFor] = useState<string | null>(null)
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
        <FirstRunWalkthrough autoOpen={false} />
      </main>
    )
  }

  // Create is an explicit act, never a side effect of opening (the model's
  // reading-card ruling) — so it writes the cloth row first, then walks in.
  // On failure updateCloth has already flashed and resynced; staying on the
  // shelf keeps the card honest about what exists.
  const createCloth = async (sourceId: string) => {
    setCreatingClothFor(sourceId)
    try {
      const ok = await updateCloth({}, sourceId)
      if (ok) {
        // A cloth starts in READING (TJ, 2026-08-08): that is where you read
        // and gather, and the title can wait — an untitled cloth is a fine
        // state, and the card says so. It briefly landed on Linking, which put
        // the naming of the work before the work.
        flash("cloth created — start reading")
        router.push(`/reading/${sourceId}`)
      }
    } finally {
      setCreatingClothFor(null)
    }
  }

  const readingCard = (s: ReadingMeta) => {
    const tally = tallies.get(s.id)
    // 0 or 1 today — the schema keeps one cloth per scope for now — but the
    // card renders a list, so several cloths per reading lands here for free.
    const clothsHere = state.cloths.filter((c) => c.scopeKey === s.id)
    // Exactly ONE door per card (TJ, 2026-08-08). "Just read" is a procedure,
    // not a path — you browse inside a cloth without capturing anything — so
    // there is no separate way in that skips the cloth. With a cloth, the card
    // body opens it; without one, the card is inert and Create Cloth is the
    // only act. That also keeps creation explicit: a card click never mints a
    // cloth, it simply does nothing until you have asked for one.
    const hasCloth = clothsHere.length > 0
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
                  {tally.bytes} passage{tally.bytes !== 1 ? "s" : ""} ·{" "}
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
      <div key={s.id} className={`shelfcard${hasCloth ? "" : " shelfnodoor"}`}>
        {hasCloth ? (
          <Link href={`/reading/${s.id}`} className="shelfmain">{body}</Link>
        ) : (
          <div className="shelfmain">{body}</div>
        )}
        {/* The cloth row (rulings 20–22, 33), reworked 2026-08-08 (TJ).

            It is INFORMATION when a cloth exists — the name and when it was
            last edited — because the card above is already the door, and two
            controls doing one thing is what made this confusing. When there is
            no cloth it carries the only act on the card. */}
        {!isLoading && (
          <div className="clothrow">
            {hasCloth ? (
              clothsHere.map((c) => (
                <span key={c.id} className="clothis">
                  <span className="clothname">
                    {c.title.trim() ? short(c.title, 52) : "Untitled cloth"}
                  </span>
                  <span className="clothmeta">
                    {c.title.trim() ? "" : "name it · "}edited {timeAgo(c.updatedAt)}
                  </span>
                </span>
              ))
            ) : (
              <>
                <span className="clothnone">No cloth yet</span>
                <button
                  className="btn ghost mini nowrapbtn"
                  onClick={() => createCloth(s.id)}
                  disabled={creatingClothFor !== null}
                  data-tip="your work on this reading — reading and gathering happen inside it, and you need never capture anything"
                >
                  {creatingClothFor === s.id ? "Creating…" : "Create Cloth"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
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
              and read. Explore it, then clear it from Keep to start your own.
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
  const { state, attributeBytes } = useLoom()
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const groups = useMemo(() => {
    const byCitation = new Map<string, string[]>()
    state.bytes.forEach((b) => {
      if (b.sourceId) return
      const key = (b.source ?? "").trim() || "\u0000no citation"
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
