"use client"

import { useEffect, useRef, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import { useDialog } from "@/components/providers/DialogProvider"
import type { Passage } from "@/lib/types"
import { readingsOf, soleSourceId } from "@/lib/scope"
import { contentWords, sortedByLabel } from "@/lib/utils"
import { tidy } from "@/lib/clothMath"
import ClothFold from "@/components/tabs/ClothFold"

type OpenTabProps = {
  onGotoPassage?: (passage: Passage) => void
  focusPassageId?: string | null
  onFocusHandled?: () => void
  /**
   * The page the reader is on, when there is a text beside this. Offered as
   * the Location so a hand capture does not make anyone retype a page number
   * the viewer already knows exactly (TJ, 2026-08-09).
   */
  currentPage?: number
  /**
   * Show the student their whole vocabulary. A callback and not an href: the
   * Workbench seeds `activeTab` once and is keyed on the reading id, so
   * navigating to `?tab=read` changes the URL and leaves the tab exactly where
   * it was. Widening that key would remount the bench and destroy the drafts
   * KEEP_ALIVE exists to protect.
   */
  onGotoVocabulary?: () => void
  /** Rendered in the reading station's slide-out card (Your work) rather than
   *  across a page: one column instead of two, since 380px will not hold both;
   *  no heading of its own (the card's head bar carries it) and no teaching
   *  prose (it would be read once and scrolled past forever). */
  compact?: boolean
}

export default function OpenTab({ onGotoPassage, focusPassageId, onFocusHandled, compact, currentPage, onGotoVocabulary }: OpenTabProps) {
  // `state` is the WHOLE graph and `scoped` is this reading's slice of it. The
  // split is load-bearing: the log renders what this reading evidences, but
  // naming, dedup and the delete guards must see every concept the student has
  // — otherwise capturing a concept met in an earlier text would mint a
  // duplicate instead of joining its evidence (spec §2 identity).
  const { state, scope, scoped, addConcept, addPassage, editConcept, removeConcept, removePassage, refilePassage, unfilePassage, flash } = useLoom()
  const { byId, titleOf } = useReadings()
  const { confirm, notify } = useDialog()
  const activeSourceId = soleSourceId(scope)
  const activeReading = activeSourceId ? byId.get(activeSourceId) : undefined
  // Working inside a reading, the citation is already known — offer it rather
  // than making the student retype it. Still editable: the passage may be
  // quoting someone else.
  const citation = activeReading
    ? [activeReading.author, activeReading.title].filter(Boolean).join(", ")
    : ""
  // The page you are looking at, in the form a citation takes. Offered the
  // same way the citation is — as a placeholder that the empty field falls
  // back to — so it is a default, never a lock: the passage may be a footnote
  // carried over from the page before, or quoted from somewhere else entirely.
  const pageHint = currentPage && currentPage > 0 ? `p. ${currentPage}` : ""
  const [source, setSource] = useState("")
  const [location, setLocation] = useState("")
  const [content, setContent] = useState("")
  const [conceptLabel, setConceptLabel] = useState("")
  const [workingDef, setWorkingDef] = useState("")
  const [newConceptOnly, setNewConceptOnly] = useState("")
  const [newConceptDef, setNewConceptDef] = useState("")
  const [showCaptureInfo, setShowCaptureInfo] = useState(false)
  const [reuseNote, setReuseNote] = useState<{ label: string; where: string[] } | null>(null)
  const [refileInputs, setRefileInputs] = useState<Record<string, string>>({})
  const [refileBusy, setRefileBusy] = useState<Record<string, boolean>>({})
  const closeCaptureInfoButtonRef = useRef<HTMLButtonElement>(null)

  const [openLogRows, setOpenLogRows] = useState<Record<string, boolean>>({})

  // Unique per surface: VocabularyTab declares a <datalist id="conceptOptions">
  // too, and both tabs are kept alive. Whichever mounted first wins the id, so
  // the other's autocomplete quietly offered the wrong list. The sheet is
  // mounted permanently now, which would have made that permanent.
  const listId = compact ? "conceptOptions-reading" : "conceptOptions"

  const findConcept = (label: string) =>
    state.concepts.find(c => c.label.toLowerCase() === label.toLowerCase())

  const handleAddByte = async () => {
    // Trim before testing: whitespace is not a passage, and " boundary objects "
    // must match the existing "boundary objects" rather than mint a duplicate.
    const text = content.trim()
    const cname = conceptLabel.trim()
    if (!text || !cname) return

    const wdef = workingDef.trim()
    // Find concept or create it. `findConcept` searches the WHOLE graph, so
    // naming an idea met in an earlier text reuses that concept rather than
    // minting a second one under the same label (spec §2 identity).
    let concept = findConcept(cname)
    // Captured before the passage lands, so it says where the concept had ALREADY
    // been met rather than counting the capture about to happen.
    const metIn = concept ? readingsOf(concept.id, state.passages) : []
    const metElsewhere = metIn.filter(id => id !== activeSourceId)
    if (!concept) {
      concept = await addConcept(cname, wdef || undefined)
    } else if (wdef && !concept.def) {
      await editConcept(concept.id, { def: wdef })
    }

    await addPassage([concept.id], source.trim() || citation, location.trim() || pageHint, text)

    // reset form (keep source/location if user wants to enter multiple passages from same place)
    setContent("")
    setConceptLabel("")
    setWorkingDef("")
    // The flash points at "its log row", so open that row — otherwise the
    // affordance it advertises is off screen (v14 set openByte on add).
    setOpenLogRows(prev => ({ ...prev, [concept.id]: true }))
    // The seam between readings: meeting the same concept in a second text is
    // the move the course is trying to teach, and it used to happen silently.
    // Counted, not judged — it says the reuse happened, never that it is right.
    if (metElsewhere.length) {
      setReuseNote({
        label: concept.label,
        where: metElsewhere.map(titleOf),
      })
      flash("passage added — you've named this concept before")
    } else {
      setReuseNote(null)
      flash("passage added — in its row you can also file it under a second concept")
    }
  }

  const handleRefile = async (b: Passage) => {
    if (refileBusy[b.id]) return
    const nm = (refileInputs[b.id] ?? "").trim()
    if (!nm) {
      await notify({
        title: "Name the second concept first.",
        body: "Type the concept this passage also evidences, then File.",
      })
      return
    }
    let concept = findConcept(nm)
    if (concept && b.conceptIds.includes(concept.id)) {
      await notify({
        title: "Already filed under that concept.",
        body: `This passage is already evidence for “${concept.label}”.`,
      })
      return
    }
    setRefileBusy(prev => ({ ...prev, [b.id]: true }))
    try {
      if (!concept) {
        concept = await addConcept(nm)
      }
      await refilePassage(b.id, concept.id)
      setRefileInputs(prev => ({ ...prev, [b.id]: "" }))
      setOpenLogRows(prev => ({ ...prev, [concept!.id]: true }))
      flash("filed under a second concept")
    } catch {
      // refilePassage resyncs and flashes the server message before rethrowing;
      // swallow here to avoid an unhandled rejection.
    } finally {
      setRefileBusy(prev => ({ ...prev, [b.id]: false }))
    }
  }

  const handleRemoveConcept = async (conceptId: string, byteCount: number) => {
    // Threads first: a concept woven into one cannot be deleted out from under
    // it. The server enforces this too — this is the readable version.
    if (state.edges.some(e => e.fromId === conceptId || e.toId === conceptId)) {
      await notify({
        title: "This concept is woven into a thread.",
        body: "Remove the thread on 02 · Linking first — deleting the concept now would take your thread with it.",
      })
      return
    }
    // Always confirm, and name what happens. Since 0021 the passages survive
    // the concept (P0.1): only the label and its pointers go.
    const label = state.concepts.find(c => c.id === conceptId)?.label ?? "this concept"
    const ok = await confirm({
      title: `Delete “${label}”?`,
      body: byteCount
        ? `Its ${byteCount} captured passage${byteCount !== 1 ? "s" : ""} stay${byteCount !== 1 ? "" : "s"} in your work, unfiled. Export from Keep first if you might want this back.`
        : "Export from Keep first if you might want this back.",
      confirmLabel: "Delete concept",
      danger: true,
    })
    if (ok) removeConcept(conceptId)
  }

  const handleAddConceptOnly = async () => {
    // Trim ONCE, at the top, and compare the trimmed value. This used to match
    // untrimmed and write trimmed, so "boundary objects " missed the homonym
    // check entirely and minted a second concept with a passage-identical stored
    // label — silently, at the exact gesture designed to ask. A trailing space
    // is what a paste leaves, and what a tapped suggestion can leave.
    // It also stops " " reaching addConcept, which does not validate.
    const name = newConceptOnly.trim()
    if (!name) return
    const existing = state.concepts.find(c => c.label.toLowerCase() === name.toLowerCase())
    if (existing) {
      // Homonyms are warned, never forbidden (ruling 36): a shared name can
      // be two distinct ideas. Same idea → reuse the one you have.
      const ok = await confirm({
        title: `You already have a concept named “${existing.label}”.`,
        body: "Make a second, distinct concept with the same name? They stay separate (homonyms) — if they turn out to be one idea, merge them in Vocabulary.",
        confirmLabel: "Make a homonym",
      })
      if (!ok) {
        setNewConceptOnly("")
        return
      }
    }
    // The gloss travels with the naming: it is the reason you expect to find
    // this, and it is what you will read the candidate passage against.
    await addConcept(name, newConceptDef.trim() || undefined)
    setNewConceptOnly("")
    setNewConceptDef("")
    flash("named — it shows as no evidence until a passage backs it")
  }

  const toggleRow = (id: string) => {
    setOpenLogRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  useEffect(() => {
    if (!showCaptureInfo) return

    closeCaptureInfoButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCaptureInfo(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showCaptureInfo])

  useEffect(() => {
    if (!focusPassageId) return
    const targetByte = state.passages.find((b) => b.id === focusPassageId)
    if (!targetByte) {
      onFocusHandled?.()
      return
    }

    const rowTimer = window.setTimeout(() => {
      const firstConcept = targetByte.conceptIds[0]
      if (firstConcept) setOpenLogRows((prev) => ({ ...prev, [firstConcept]: true }))
    }, 0)

    const timer = window.setTimeout(() => {
      const target = document.querySelector(`[data-passage-id="${focusPassageId}"]`) as HTMLElement | null
      target?.scrollIntoView({ behavior: "smooth", block: "center" })
      onFocusHandled?.()
    }, 40)

    return () => {
      window.clearTimeout(rowTimer)
      window.clearTimeout(timer)
    }
  }, [focusPassageId, onFocusHandled, state.passages])

  const captureHeading = (
        <h2 className="heading-with-info">
          Capture a passage
          <button
            type="button"
            className="iconbtn"
            aria-label="How capturing a passage works"
            aria-haspopup="dialog"
            aria-expanded={showCaptureInfo}
            aria-controls="captureInfoDialog"
            onClick={() => setShowCaptureInfo(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
        </h2>
  )

  const captureInfo = (
    <>
        {showCaptureInfo && (
          <div className="info-scrim" onClick={() => setShowCaptureInfo(false)}>
            <section
              id="captureInfoDialog"
              className="info-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="captureInfoTitle"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                ref={closeCaptureInfoButtonRef}
                type="button"
                className="iconbtn info-close"
                aria-label="Close info"
                onClick={() => setShowCaptureInfo(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <div className="info-k">the author&apos;s words, and your name for them</div>
              <h2 id="captureInfoTitle">Capturing a passage</h2>
              <p>
                A passage is always the same thing: the author&apos;s words you want to keep, attached to a concept you name.
              </p>
              <p>
                This reading has no text in Loom — you added it as a card for something the
                library does not hold — so you carry the passage across yourself. Paste or
                type it, add the source and location, then name what it is about.
              </p>
              <p>
                In a reading that <i>does</i> have its text here, you capture by <b>selecting
                the words on the page</b> instead. Loom fills in the passage, source and page,
                and anchors it so it lights up whenever you open the reading.
              </p>
              <p>
                Either way the thinking stays yours. The word chips are only a scaffold: tap
                useful words from the passage, reuse an existing concept, or type a new phrase
                in your own language.
              </p>
              <p className="info-note">
                Nothing is generated. Loom helps you carry the quote; you make the code.
              </p>
              <button type="button" className="btn ghost mini" onClick={() => setShowCaptureInfo(false)}>Got it</button>
            </section>
          </div>
        )}
    </>
  )

  const captureForm = (
    <>
        <p className="do">Do this — paste or type the passage, then name the concept it evidences and gloss it in your own words.</p>
        <p className="hint">A passage = the author&apos;s words, verbatim, with its citation. Choosing the passage is <i>your</i> judgment — that&apos;s the point. Loom can carry over source details and offer passage words to tap; it does not summarize or choose the concept for you.</p>
        
        <div className="form-row">
          <span className="label">
            Source — author, work
            {citation ? <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--grey)" }}> (this reading, unless you say otherwise)</span> : null}
          </span>
          <input
            className="mono-in"
            placeholder={citation || "Suchman, Plans and Situated Actions"}
            title="who wrote it, and what work it's from"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>

        <div className="form-row">
          <span className="label">
            Location
            {pageHint ? <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--grey)" }}> (the page you are on, unless you say otherwise)</span> : null}
          </span>
          {/* Named, because the placeholder is no longer a constant: it is the
              page you are on. A spec matching the old literal broke the moment
              this started offering "p. 11" (2026-08-09). */}
          <input
            id="bLocation"
            className="mono-in"
            placeholder={pageHint || "ch. 3, p. 49"}
            title="page, chapter, or timestamp — so you (and readers) can get back to the source"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="form-row">
          <span className="label">Passage — the author&apos;s words, verbatim</span>
          <textarea
            id="bText"
            placeholder="paste or type the passage…"
            title="verbatim, with citation — this is your evidence"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={(e) => {
              e.preventDefault()
              setContent(tidy(e.clipboardData.getData("text")))
            }}
          />
          <div className="scaffold" style={{marginTop: "12px"}}>
            <div className="snote">
              A <b>concept</b> is the idea this passage evidences — a <b>short noun phrase</b>, often the author's own words. If she names it ("boundary objects"), use her name for it. Your own-words gloss goes in the <b>description</b> — a sentence is fine there, crude is welcome. Rename anything later.
            </div>
            <div className="snote" style={{marginTop: "5px", color: "var(--ink-soft)"}}>
              One passage can hold several concepts — capture it once, then "also file under another concept" from your work.
            </div>
            <div className="snote" style={{fontSize: "12px", color: "var(--ink-soft)", marginTop: "8px"}}>
              Stuck naming it? <b style={{color: "var(--ink)", fontWeight: 500}}>Point at the words in the passage that carry the point</b> and tap to build the concept from the author's own words.
            </div>
            {content.trim() ? (
              <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {contentWords(content).map(w => (
                  <span 
                    key={w} 
                    className="chip" 
                    onClick={() => setConceptLabel(prev => prev ? `${prev} ${w}` : w)}
                    style={{
                      fontFamily: "var(--mono)", fontSize: "12px", background: "#fff", border: "1px solid var(--rule)", 
                      borderRadius: "12px", padding: "3px 9px", cursor: "pointer", color: "var(--ink)"
                    }}
                  >{w}</span>
                ))}
              </div>
            ) : (
              <div className="snote" style={{fontStyle: "italic", fontSize: "12px", color: "var(--ink-soft)", marginTop: "8px"}}>
                …paste a passage above and its words appear here to tap.
              </div>
            )}
            
            <details className="ladder" style={{marginTop: "12px", fontSize: "13px"}}>
              <summary style={{cursor: "pointer", color: "var(--sage)"}}>still stuck? a few ways in</summary>
              <ul style={{marginTop: "6px", paddingLeft: "20px", color: "var(--ink-soft)", lineHeight: "1.5"}}>
                <li>What is this passage an <b style={{color: "var(--ink)", fontWeight: 500}}>example of</b>?</li>
                <li>Tell a friend what this bit is about in <b style={{color: "var(--ink)", fontWeight: 500}}>five words</b>.</li>
                <li>What's the <b style={{color: "var(--ink)", fontWeight: 500}}>one move</b> the author is making here?</li>
                <li className="eg" style={{marginTop: "6px", color: "var(--ink-soft)"}}>
                  Just to show the shape — concepts as noun phrases: &nbsp;<i>&ldquo;boundary objects&rdquo; · &ldquo;the central tension&rdquo;</i>
                </li>
              </ul>
              <div style={{marginTop: "6px", color: "var(--ink-soft)", fontSize: "12px"}}>
                A concept can be a phrase, not a word. It's provisional — rename it later, or type an existing name to reuse it.
              </div>
            </details>
          </div>
        </div>
        
        <div className="form-row">
          <span className="label">Concept — a short noun phrase naming the idea <span style={{textTransform: "none", letterSpacing: 0, color: "var(--grey)"}}>(one per passage — you can file the same passage under a second concept from your work)</span></span>
          <input
            list={listId}
            placeholder="e.g. boundary objects · satisficing · valence"
            title="a noun phrase, not a sentence — if the author names it, use her name for it"
            value={conceptLabel}
            onChange={(e) => setConceptLabel(e.target.value)}
          />
          {/* Every concept, alphabetically — this is how you find one you
              already made, including from another reading, so that it joins its
              evidence instead of becoming a duplicate. */}
          <datalist id={listId}>
            {sortedByLabel(state.concepts).map(c => <option key={c.id} value={c.label} />)}
          </datalist>
        </div>

        <div className="form-row">
          <span className="label">Description — the concept in your own words <span style={{textTransform: "none", letterSpacing: 0}}>(optional)</span></span>
          <input
            placeholder="e.g. a thing that means different things to different groups but still holds them together"
            title="your own-words gloss — a sentence is fine; this is where crude is welcome"
            value={workingDef}
            onChange={(e) => setWorkingDef(e.target.value)}
          />
        </div>

        <button
          className="btn"
          onClick={handleAddByte}
          disabled={!content.trim() || !conceptLabel.trim()}
          title="files the passage under its concept, in your work"
        >
          Add passage
        </button>
        {/* v14 alerted the reason on click; the button here is disabled instead,
            so the same coaching has to be visible without one. */}
        {(!content.trim() || !conceptLabel.trim()) && (
          <p className="ghostnote" style={{ marginTop: "7px" }}>
            {!content.trim() && !conceptLabel.trim()
              ? "Paste or type a passage, then name the concept it evidences."
              : !content.trim()
                ? "Paste or type a passage."
                : "Name the concept this passage evidences — a short noun phrase (the author's own term is often best)."}
          </p>
        )}
        {reuseNote && (
          <div className="seam" role="status">
            <span className="cap">the same concept, twice</span>
            <p>
              You&apos;ve named <b>{reuseNote.label}</b> before — in{" "}
              {reuseNote.where.map((w, i) => (
                <span key={w + i}>
                  {i > 0 && (i === reuseNote.where.length - 1 ? " and " : ", ")}
                  <i>{w}</i>
                </span>
              ))}
              . This passage joins its evidence there; it is one concept, not two.
            </p>
            <button type="button" className="btn ghost mini compact" onClick={() => setReuseNote(null)}>
              noted
            </button>
          </div>
        )}
    </>
  )

  /**
   * The three kinds a Concept can be, relative to THIS reading (TJ,
   * 2026-08-09). `scope.ts` already computes them — `evidenced` (a passage
   * here) and `hasByte` (a passage anywhere) — but `isIn` buckets the first
   * and third together, because both belong in this reading's warp and both
   * are linkable here. That is right for scoping and under-drawn for reading:
   * one is evidence you hold, the other is a name you are carrying.
   *
   * KINDS, NEVER STAGES. Nothing here is further along than anything else, and
   * the transitions run every direction: name-then-find is 3→1, unfiling the
   * only passage is 1→3, finding it in a second text is 2→1, unfiling it here
   * while it survives elsewhere is 1→2. So: no order implied, no counting of
   * one against another, no "yet" in a heading. "No evidence" is the model's
   * own word for the third, and it is "a designation, never a warning".
   *
   * A concept in `scoped.concepts` with no passage HERE can only be one with
   * no passage anywhere — anything evidenced elsewhere is in `scoped.outside`
   * by construction — so the split below needs no extra query.
   */
  const here = sortedByLabel(scoped.concepts).filter(c =>
    scoped.passages.some(b => b.conceptIds.includes(c.id))
  )
  const namedOnly = sortedByLabel(scoped.concepts).filter(c =>
    !scoped.passages.some(b => b.conceptIds.includes(c.id))
  )

  const logCard = (
      <div className="card">
        {/* In the sheet, the panel's own head bar IS this heading — see
            .yourwork-head, which carries the name and the same tally. On a
            reference-only reading there is no sheet, so the card carries it. */}
        {!compact && (
          <h2>Your work <span className="n">{scoped.passages.length ? `(${scoped.passages.length} passages · ${scoped.concepts.length} concepts)` : ""}</span></h2>
        )}
        {/* Teaching copy, and only where there is room for it. In the sheet
            these two paragraphs sat above the list permanently, in a 380px
            column — read once, then scrolled past on every visit for the rest
            of the course. The list itself is self-evident once you have used
            it once; the reference-only view, which is a whole page and is where
            a student meets capture with no text beside it, keeps them. */}
        {!compact && (
          <>
            <p className="do calm">Everything you capture from this reading lands here, A–Z.</p>
            <p className="hint">Click a row to open it — edit the description, or file the same passage under another concept. When you have a handful, go to <b>02 — Linking</b> and start connecting them.</p>
          </>
        )}

        <div className="scrollbox">
          {scoped.concepts.length === 0 && (
            <div className="empty">
              <svg width="34" height="18" viewBox="0 0 34 18" fill="none" stroke="#a39f92" strokeWidth="1.3"><path d="M2 13 L7 5 L12 13 L17 5 L22 13 L27 5 L32 13"/></svg>
              <span className="cap">your work fills as you lay warp</span>
            </div>
          )}
          {/* Three kinds, never three steps (TJ, 2026-08-09). Headings say what
              a concept IS relative to this reading, not how far along it is —
              see the note above `here`. A group with nothing in it is not
              drawn, so an empty heading never implies a gap to fill. */}
          {([
            ["here", "In this reading", here],
            // The model's own word for the third, and its own ruling about it:
            // "No evidence is a designation, never a warning to act on."
            ["named", "No evidence", namedOnly],
          ] as const).map(([key, heading, group]) => group.length === 0 ? null : (
          <div key={key}>
          <div className="lgroup">{heading}</div>
          {group.map(concept => {
            const isOpen = openLogRows[concept.id]
            // This reading's evidence for the concept. A concept met in an
            // earlier text keeps that evidence — it is counted below rather
            // than shown here, so the log stays this reading's own work.
            const conceptPassages = scoped.passages.filter(b => b.conceptIds.includes(concept.id))
            const elsewhere = state.passages.filter(
              b => b.conceptIds.includes(concept.id) && !conceptPassages.some(x => x.id === b.id)
            ).length
            
            return (
              <div key={concept.id} className={`lrow ${isOpen ? "open" : ""}`}>
                {/* No destructive control here: this header is the row's
                    expand/collapse target, so "remove concept" lives inside the
                    opened row next to "remove passage", labelled, as in v14. */}
                <div className="lhead" onClick={() => toggleRow(concept.id)} style={{ display: "flex", alignItems: "center" }}>
                  <div className="lconcept" style={{flex: 1}}>{concept.label}</div>
                  {/* No "0 passages" under a heading that already reads NO
                      EVIDENCE: it says the same thing twice, and the zero is
                      the more judgemental of the two. A count belongs where
                      there is something to count. */}
                  {(conceptPassages.length > 0 || elsewhere > 0) && (
                    <div className="lsrc">
                      {conceptPassages.length} passage{conceptPassages.length !== 1 ? "s" : ""}
                      {elsewhere ? ` · ${elsewhere} elsewhere` : ""}
                    </div>
                  )}
                </div>
                {isOpen && (
                  <div className="lbody">
                    <div className="defrow">
                      <span className="label">Concept</span>
                      <input
                        key={concept.label}
                        placeholder="concept label…"
                        defaultValue={concept.label}
                        onBlur={async (e) => {
                          const input = e.target
                          const v = input.value.trim()
                          if (!v || v === concept.label) return
                          const clash = state.concepts.find(
                            c => c.id !== concept.id && c.label.toLowerCase() === v.toLowerCase()
                          )
                          if (clash) {
                            // Warned, never forbidden (ruling 36): homonyms
                            // are legal; merge handles true duplicates.
                            const ok = await confirm({
                              title: `You already have a concept named “${v}”.`,
                              body: "Rename anyway? The two stay distinct concepts sharing a name — if they are one idea, merge them instead.",
                              confirmLabel: "Rename anyway",
                            })
                            if (!ok) {
                              input.value = concept.label
                              return
                            }
                          }
                          editConcept(concept.id, { label: v })
                          flash("renamed")
                        }}
                      />
                    </div>
                    <div className="defrow">
                      <span className="label">Description</span>
                      <input
                        placeholder="in your words; same sense across your sources?"
                        defaultValue={concept.def ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (concept.def ?? "")) {
                            editConcept(concept.id, { def: e.target.value })
                          }
                        }}
                      />
                    </div>
                    {conceptPassages.map(b => (
                      <div key={b.id} data-passage-id={b.id} style={{ marginTop: "12px", borderBottom: "1px dotted var(--rule)", paddingBottom: "8px" }}>
                        <div className="passage">"{b.content}"</div>
                        <div className="src">
                          {b.source || "—"}{b.location ? ` · ${b.location}` : ""}
                          <span className="rm-actions" style={{ marginLeft: "8px" }}>
                            <button
                              type="button"
                              className="rm"
                              style={{ marginRight: "8px", background: "none", border: "none", padding: 0 }}
                              onClick={() => onGotoPassage?.(b)}
                              disabled={!b.sourceId && !b.source}
                              title={b.sourceId || b.source ? "Open this passage in the reading" : "No reading linked to this passage"}
                            >
                              goto
                            </button>
                            {b.conceptIds.length > 1 ? (
                              // A multi-filed passage: this row's control removes
                              // only THIS filing — deleting the passage here would
                              // silently take every other concept's evidence too.
                              <button
                                type="button"
                                className="rm"
                                style={{ background: "none", border: "none", padding: 0 }}
                                onClick={() => unfilePassage(b.id, concept.id)}
                                title="Filed under several concepts — this removes it from this one only."
                              >
                                unfile from this concept
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="rm"
                                style={{ background: "none", border: "none", padding: 0 }}
                                onClick={() => removePassage(b.id)}
                              >
                                remove passage
                              </button>
                            )}
                          </span>
                        </div>
                        <div className="quietrow" style={{ marginTop: "9px" }}>
                          <input
                            placeholder="also file this passage under another concept…"
                            title="one passage can evidence several concepts — name a second one here"
                            value={refileInputs[b.id] ?? ""}
                            onChange={(e) => setRefileInputs(prev => ({ ...prev, [b.id]: e.target.value }))}
                          />
                          <button className="btn ghost mini" onClick={() => handleRefile(b)} disabled={!!refileBusy[b.id]}>File</button>
                        </div>
                      </div>
                    ))}
                    {elsewhere > 0 && (
                      <p className="ghostnote" style={{ marginTop: "10px" }}>
                        {elsewhere} more passage{elsewhere !== 1 ? "s" : ""} evidence{elsewhere === 1 ? "s" : ""} this concept in your other readings — one concept, evidence from several texts.
                      </p>
                    )}
                    {/* Merge lives on 04 · Vocabulary (model §3 tab 4), where
                        you can see every concept you own at once — which is
                        what you need to judge whether two are really one. */}
                    <button
                      type="button"
                      className="rm"
                      style={{ background: "none", border: "none", padding: 0, marginTop: "12px" }}
                      onClick={() => handleRemoveConcept(concept.id, conceptPassages.length + elsewhere)}
                    >
                      remove concept
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          </div>
          ))}

          {/* The third kind. Lighter than the other two on purpose: these are
              not in this reading's warp — you cannot link them here until a
              passage brings them in — so they are context rather than work.
              But they are NAMED now, where this used to be a bare count: the
              whole point of the group is scanning what you are looking for
              while you read. */}
          {scoped.outside.length > 0 && (
            <>
              <div className="lgroup">In your other readings</div>
              {sortedByLabel(scoped.outside).map(c => (
                <div key={c.id} className="lrow elsewhere">
                  <div className="lhead" style={{ display: "flex", alignItems: "center" }}>
                    <div className="lconcept" style={{ flex: 1 }}>{c.label}</div>
                    <div className="lsrc">{readingsOf(c.id, state.passages).map(titleOf).join(" · ")}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {scoped.outside.length > 0 && (
          <p className="ghostnote" style={{ marginTop: "10px" }}>
            Not hidden, just not evidenced here. Type one&apos;s name above to file a
            passage from this reading under it{onGotoVocabulary ? <>, or <button type="button" className="linkish" onClick={onGotoVocabulary}>see them all in Vocabulary</button></> : null}.
          </p>
        )}

        {/* Naming a concept BEFORE its evidence is a first-class move, not an
            oddity (TJ, 2026-08-08): you name what you expect to find, describe
            it, then read for support. It used to say "(rare)", which talked
            students out of it, and it took no description — so the gloss you
            had in mind at the moment of naming had nowhere to go. */}
        <div className="aheadofit">
          <span className="label">Name a concept before its evidence</span>
          <p className="hint" style={{ marginTop: 2 }}>
            Expecting an idea before you have found it in the text? Name it, say what you
            think it is, and go looking. It shows as <b>no evidence</b> until a passage
            backs it — a state, not a fault — and it stays in view in every reading while
            you hunt.
          </p>
          <div className="quietrow" style={{ marginTop: 6 }}>
            <input
              list={listId}
              placeholder="the concept you are looking for…"
              value={newConceptOnly}
              onChange={(e) => setNewConceptOnly(e.target.value)}
            />
            <button className="btn ghost mini" onClick={handleAddConceptOnly}>Add</button>
          </div>
          <input
            style={{ marginTop: 6 }}
            placeholder="what you take it to mean, in your own words (optional)"
            value={newConceptDef}
            onChange={(e) => setNewConceptDef(e.target.value)}
          />
        </div>
      </div>
  )

  // Two shapes, because the doorway differs (TJ, 2026-08-08).
  //
  // Beside a text you can select, the LOG is the rail and capture by hand is a
  // fold at its foot. Typing a passage that is on screen invites paraphrase
  // where the rule is the author's words verbatim, re-enters a page number the
  // viewer already knows exactly, and — because a typed passage carries no
  // offsets — produces a passage that never highlights, sitting in the same
  // list as ones that do. The fold stays because a scanned page has no text
  // layer to select from, and this library has those.
  if (compact) {
    return (
      <div className="onecol">
        {/* The cloth names this work, so it sits at the head of it (TJ,
            2026-08-08). Folded: you are here to read and gather, and the
            title can wait as long as you like. */}
        <ClothFold />
        {logCard}
        <details className="card handfold">
          <summary>
            <span className="tw">▸</span>
            <h2>Capture a passage by hand</h2>
          </summary>
          <p className="hint" style={{ marginTop: "10px" }}>
            Normally you capture by <b>selecting the words in the text</b> beside this —
            that keeps the passage verbatim and anchors it to the page, so it lights up
            whenever you open the reading. But <b>some things on a page cannot be
            selected at all</b>: a concept map, a diagram&apos;s labels, a figure drawn
            by hand, a page that was photographed rather than typeset. There is no text
            layer under them for a highlight to hold on to, so this is how you keep
            them. Loom fills in the reading and the page you are on; a typed passage is
            not anchored and will not highlight.
          </p>
          {captureForm}
        </details>
      </div>
    )
  }

  // No text to select from — a reference-only reading the student minted for
  // something the library does not hold. Here typing IS the only doorway, so
  // the form leads.
  return (
    <>
      <ClothFold />
      <div className="two">
        <div className="card">
          {captureHeading}
          {captureInfo}
          {captureForm}
        </div>
        {logCard}
      </div>
    </>
  )
}
