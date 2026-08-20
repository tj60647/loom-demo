"use client"

import { useEffect, useRef, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import type { Passage } from "@/lib/types"
import { readingsOf, soleSourceId } from "@/lib/scope"
import { sortedByLabel } from "@/lib/utils"
import PassageCard from "@/components/cards/PassageCard"
import ConceptCard from "@/components/cards/ConceptCard"
import NameConceptCard from "@/components/cards/NameConceptCard"
import { useCoinConcept } from "@/components/cards/useCoinConcept"
import { useRemovePassage } from "@/components/cards/useRemovePassage"
import { useRenameConcept } from "@/components/cards/useRenameConcept"
import { tidy } from "@/lib/clothMath"
import ClothFold from "@/components/tabs/ClothFold"
import ReuseOffer from "@/components/ui/ReuseOffer"
import ConceptNamingAssist from "@/components/ui/ConceptNamingAssist"

type OpenTabProps = {
  onGotoPassage?: (passage: Passage) => void
  focusPassageId?: string | null
  /**
   * Open at a CONCEPT, the mirror of `focusPassageId` (TJ, 2026-08-17): a
   * margin card's badge names a concept, and pressing it should land on that
   * concept's row rather than merely on the panel.
   */
  focusConceptId?: string | null
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
  /** A search hit named this reading's cloth — open its fold on arrival. */
  openClothFold?: boolean
}

export default function OpenTab({ onGotoPassage, focusPassageId, focusConceptId, onFocusHandled, compact, currentPage, onGotoVocabulary, openClothFold }: OpenTabProps) {
  // `state` is the WHOLE graph and `scoped` is this reading's slice of it. The
  // split is load-bearing: the log renders what this reading evidences, but
  // naming, dedup and the delete guards must see every concept the student has
  // — otherwise capturing a concept met in an earlier text would mint a
  // duplicate instead of joining its evidence (spec §2 identity).
  const { state, scope, scoped, isLoading, addConcept, addPassage, editConcept, addPassageConcept, unfilePassage, editPassageNote, flash } = useLoom()
  const { byId, titleOf } = useReadings()
  // Shared with the margin rail card, so the two dialogs cannot drift apart.
  const removePassageWithConfirm = useRemovePassage()
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
  const [showCaptureInfo, setShowCaptureInfo] = useState(false)
  // Carries the passage and concept ids now, not just the copy: the note has
  // an action in it since 2026-08-09 ("make it a separate concept"), and that
  // needs to know which passage to move and which concept to move it off.
  const [reuseNote, setReuseNote] = useState<{
    passageId: string
    conceptId: string
    label: string
    where: string[]
    filledDescription: string
  } | null>(null)
  /** Which passage's add-concept card is open. One at a time across the whole
   *  list: several open editors in a scrolling column is a form, not a card. */
  const [addConceptFor, setAddConceptFor] = useState<string | null>(null)
  /** Which end of the join this panel is reading from — see the note by
   *  `passagesAZ`. Declared with the rest of the state because two focus
   *  effects set it, and both run above where the list is built. */
  const [view, setView] = useState<"concepts" | "passages">("passages")
  const closeCaptureInfoButtonRef = useRef<HTMLButtonElement>(null)

  const [openLogRows, setOpenLogRows] = useState<Record<string, boolean>>({})

  // Unique per surface: VocabularyTab declares a <datalist id="conceptOptions">
  // too, and both tabs are kept alive. Whichever mounted first wins the id, so
  // the other's autocomplete quietly offered the wrong list. The sheet is
  // mounted permanently now, which would have made that permanent.
  const listId = compact ? "conceptOptions-reading" : "conceptOptions"
  /**
   * Every concept, alphabetically — how you find one you already made,
   * including from another reading, so it joins its evidence instead of
   * becoming a duplicate.
   *
   * It used to be declared inside `captureForm`, which renders ONLY on a
   * reference-only reading. So in the sheet — the compact branch, where every
   * "add concept to passage" input lives — `list={listId}` pointed at a
   * datalist that was never on the page, and none of those fields has ever
   * autocompleted (TJ, 2026-08-17: "why when i type in concept do i not get
   * the autocomplete list of named concepts?"). Rendered per branch now, so
   * it exists wherever an input names it.
   */
  const conceptOptions = (
    <datalist id={listId}>
      {/* Blank labels are FILTERED, never placeheld: an <option value> is what
          lands in the field and is then matched by findConcept to reuse or coin,
          so "(unlabeled concept)" here would mint a Concept by that name. Same
          guard, same reason, as cards/AddConceptCard.tsx. */}
      {sortedByLabel(state.concepts).filter(c => c.label.trim()).map(c => <option key={c.id} value={c.label} />)}
    </datalist>
  )

  const findConcept = (label: string) =>
    state.concepts.find(c => c.label.toLowerCase() === label.toLowerCase())

  const handleAddPassage = async () => {
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
    // Whether THIS capture is what filled the borrowed concept's Description.
    // If the student then separates, that sentence goes with the new concept
    // rather than staying on one they have just said is a different idea.
    let filledDescription = ""
    if (!concept) {
      concept = await addConcept(cname, wdef || undefined)
    } else if (wdef && !concept.def) {
      await editConcept(concept.id, { def: wdef })
      filledDescription = wdef
    }

    const saved = await addPassage([concept.id], source.trim() || citation, location.trim() || pageHint, text)

    // reset form (keep source/location if user wants to enter multiple passages from same place)
    setContent("")
    setConceptLabel("")
    setWorkingDef("")
    // The flash points at "its log row", so open that row — otherwise the
    // affordance it advertises is off screen (v14 set openPassage on add).
    setOpenLogRows(prev => ({ ...prev, [concept.id]: true }))
    // The seam between readings: meeting the same concept in a second text is
    // the move the course is trying to teach, and it used to happen silently.
    // Counted, not judged — it says the reuse happened, never that it is right.
    if (metElsewhere.length) {
      setReuseNote({
        passageId: saved.id,
        conceptId: concept.id,
        label: concept.label,
        where: metElsewhere.map(titleOf),
        filledDescription,
      })
      flash("passage added — you've named this concept before")
    } else {
      setReuseNote(null)
      flash("passage added — in its row you can also file it under a second concept")
    }
  }

  // One handler for both filings, because they are the same act: naming the
  // concept a passage evidences. The difference is only how many it already
  // had — a passage filed nowhere is being named for the first time, so the
  // copy says that rather than "a second concept" (TJ, 2026-08-12).
  /* handleRename moved into cards/useRenameConcept on 2026-08-18, when 04 ·
     Vocabulary gained the same field. One homonym dialog, worded once. */
  const handleRename = useRenameConcept()

  /* renderEvidence stood here until 2026-08-18. Your work drew a concept's
     evidence itself — the quotation, its citation and "remove passage from
     concept" — and ConceptCard draws all three now, for every station that
     opens a concept, as citations with the passage one disclosure down. The
     acts survive through the card: the passage is still a door, and the unfile
     is still offered and still worded from the concept's side. */


  /* handleRefile lived here until 2026-08-18. It backed the labelled text
     input and `add` button in the passage row — a second, thinner way to do
     what the margin card already did with a + and a card: no description
     field, no picker, and it told you a concept was already filed only after
     you had pressed. Both are now one AddConceptCard (TJ: "use the add concept
     to passage card when + is pressed"). Two behaviours went with it and are
     not missed here: its own flash ("named — filed under X"), since
     addPassageConcept already flashes through LoomProvider; and forcing the new
     concept's row open in the CONCEPTS view, which is a different view than
     the one the act now happens in. */

  /* handleRemoveConcept lived here. It moved out with the button on
     2026-08-17: deleting a concept is 04 · Vocabulary's act, and VocabularyTab
     has carried its own copy — same thread guard, same confirmation — all
     along. What was here was the second one. */

  /* handleAddConceptOnly moved into cards/useCoinConcept on 2026-08-18, when
     the warp and 04 gained the same form. One homonym warning, worded once —
     and the trim-once rule it carried travelled with it. */
  const handleAddConceptOnly = useCoinConcept()

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

  /**
   * Open at a concept: switch to the view that lists concepts, expand its row,
   * and scroll to it. Same shape as the passage effect below, including its
   * "not here YET is not not here" patience — a concept can be targeted before
   * the loom has arrived.
   */
  useEffect(() => {
    if (!focusConceptId) return
    const target = state.concepts.find((c) => c.id === focusConceptId)
    if (!target) {
      if (!isLoading) onFocusHandled?.()
      return
    }
    // Deferred, not synchronous: setting state in an effect body cascades a
    // render, and the passage effect below already takes this shape.
    const rowTimer = window.setTimeout(() => {
      setView("concepts")
      setOpenLogRows((prev) => ({ ...prev, [focusConceptId]: true }))
    }, 0)
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-concept-id="${focusConceptId}"]`) as HTMLElement | null
      el?.scrollIntoView({ behavior: "smooth", block: "center" })
      onFocusHandled?.()
    }, 40)
    return () => {
      window.clearTimeout(rowTimer)
      window.clearTimeout(timer)
    }
  }, [focusConceptId, onFocusHandled, state.concepts, isLoading])

  useEffect(() => {
    if (!focusPassageId) return
    const targetPassage = state.passages.find((b) => b.id === focusPassageId)
    if (!targetPassage) {
      // "Not here yet" is not "not here" (2026-08-13). This used to give up the
      // moment it could not find the row, which was right while the only way to
      // set a target was pressing something — the rows were already on screen.
      // A search hit's deep link arrives with the id BEFORE the loom does, so
      // clearing on the first empty pass threw the target away a beat before
      // the passage existed, and the row never opened.
      if (!isLoading) onFocusHandled?.()
      return
    }

    const rowTimer = window.setTimeout(() => {
      // The panel has two views since 2026-08-17. A passage target belongs in
      // the one that lists passages — landing on the concept list and expanding
      // a row there is the old behaviour of a panel that had nowhere else to
      // go. The concept row is still expanded, so switching back finds it open.
      setView("passages")
      const firstConcept = targetPassage.conceptIds[0]
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
  }, [focusPassageId, onFocusHandled, state.passages, isLoading])

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
        
        {/* 2026-08-09 (TJ): this said "(this reading, unless you say
            otherwise)" and could not keep the promise. Typing here sets
            `passage.source`, a citation STRING; `passage.sourceId` — what
            `scopedGraph`, the tallies, the overlays and the export anchors all
            actually read — is stamped from the open reading either way, and
            `attributePassages` is guarded by `isNull(sourceId)` so it can
            never be re-attributed afterwards.

            The field's real job is worth keeping: recording that these words
            are Suchman's even though you met them quoted inside Bucciarelli.
            So it is named for that job, the false promise is gone, and the
            filing it never mentioned is now stated outright — which is
            strictly more than the old label offered, since a student could
            not previously see where their passage was going at all. */}
        <div className="form-row">
          <span className="label">
            Citation — author, work
          </span>
          <input
            className="mono-in"
            placeholder={citation || "Suchman, Plans and Situated Actions"}
            title="who wrote the words — change it when the passage quotes someone else"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
        {/* Names the READING, not the citation string. Using `citation` here
            printed the same text that is already in the field above, so the
            line read as an echo of the input — the exact opposite of its job,
            which is to show that the two are different things. */}
        {activeSourceId ? (
          <p className="ghostnote" style={{ marginTop: "-4px", marginBottom: "10px" }}>
            Filed under <i>{titleOf(activeSourceId)}</i> — the reading you have open. The citation
            travels with the passage and may name someone else; the filing follows the reading.
          </p>
        ) : null}

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
          {/* The naming assist used to sit HERE — above the Concept field it
              coaches, inside the passage row (TJ, 2026-08-13). It is under that
              field now, and shared with the capture modal:
              components/ui/ConceptNamingAssist.

              Two prose notes went with it, because the Concept field's own
              label already says both: "a short noun phrase naming the idea"
              carried the first, and "(one per passage — you can file the same
              passage under a second concept from your work)" is the second,
              word for word. The only line not said elsewhere on screen was that
              a crude description is welcome, which the Description row now says
              in its own label instead of by hover. */}
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
          <ConceptNamingAssist passage={content} value={conceptLabel} onChange={setConceptLabel} />
        </div>

        <div className="form-row">
          <span className="label">Description — the concept in your own words <span style={{textTransform: "none", letterSpacing: 0}}>(optional — a sentence is fine, crude is welcome)</span></span>
          <input
            placeholder="e.g. a thing that means different things to different groups but still holds them together"
            title="your own-words gloss — a sentence is fine; this is where crude is welcome"
            value={workingDef}
            onChange={(e) => setWorkingDef(e.target.value)}
          />
        </div>

        <button
          className="btn"
          onClick={handleAddPassage}
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
        {/* The seam. Until 2026-08-09 this said "it is one concept, not two" —
            a verdict on a question only the student can answer, delivered
            after the fact. `ReuseOffer` is the shared version of this moment;
            the PDF path renders the same component so the two cannot drift
            apart again. */}
        {reuseNote && (
          <ReuseOffer
            passageId={reuseNote.passageId}
            conceptId={reuseNote.conceptId}
            label={reuseNote.label}
            where={reuseNote.where}
            filledDescription={reuseNote.filledDescription}
            onResolved={() => setReuseNote(null)}
          />
        )}
    </>
  )

  /**
   * The three kinds a Concept can be, relative to THIS reading (TJ,
   * 2026-08-09). `scope.ts` already computes them — `evidenced` (a passage
   * here) and `hasPassage` (a passage anywhere) — but `isIn` buckets the first
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
   * no passage anywhere — `scope.ts`'s `isIn` is `evidenced.has(id) ||
   * !hasPassage.has(id)`, so anything evidenced elsewhere is in
   * `scoped.outside`. That is why the card's "no evidence" tag is true in this
   * panel without a second query, and why its "N elsewhere" branch cannot fire
   * here at all.
   *
   * The `here`/`namedOnly` split that used to stand here went on 2026-08-18
   * with the two headings it fed; the kinds above are still the kinds, they
   * are just said on the row now.
   */
  /**
   * The captures with no name on them (TJ, 2026-08-12). An unlabeled passage
   * is a whole act, not half of one — the capture toast says so, and says
   * "name it in Your work whenever the word arrives". Your work had nowhere
   * for it to be: every row here hangs off a concept, so a passage filed
   * under none of them counted in the tally at the head of the panel and then
   * appeared in no row beneath it. The student's own words, invisible in the
   * one place that is meant to hold them.
   *
   * Kept in capture order, not A–Z: they have no label to sort by, and the
   * order you found them in is the only order they have.
   */
  const unlabeled = scoped.passages.filter(b => b.conceptIds.length === 0)

  /**
   * CONCEPTS or PASSAGES (TJ, 2026-08-17), in the same segmented control the
   * reading toolbar uses for its layout — one two-state switch, one pattern.
   *
   * The panel was concept-centric only, and that is exactly why an unlabeled
   * passage needed a third group bolted on the end of a list of concepts. It
   * is not a special case in the model — it is a passage with no concepts —
   * and in the passage view it is simply a row like any other, whose concept
   * chips happen to be absent. The exception dissolves into the ordinary.
   *
   * The two views hold the same rows, read from the two ends of
   * `passage_concept`: concepts with their passages, or passages with their
   * concepts. Neither is derived from the other on the server — the join is
   * symmetric, and only the client's `Passage.conceptIds` flattening is not.
   */
  const passagesAZ = [...scoped.passages].sort((a, b) =>
    (a.source ?? "").localeCompare(b.source ?? "") || (a.location ?? "").localeCompare(b.location ?? "")
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

        {/* Which end of the join you are reading from. Hidden when there is
            nothing yet: a switch between two empty lists is a control that
            cannot do anything. */}
        {/* The band exists so the switch can stay put while the list scrolls
            under it — see .yourwork-body .viewswitch. It is a bare wrapper
            everywhere else: nothing styles it outside the sheet. */}
        {(scoped.concepts.length > 0 || unlabeled.length > 0) && (
          <div className="viewswitch">
          <div className="segmented" role="group" aria-label="Read your work by">
            {/* Passages first, and the view you land on (TJ, 2026-08-17).
                This panel opens over a text you are reading: what you just did
                was capture a passage, and what you want to see is the passage
                you captured. Concepts are the second question. */}
            <button
              className={`btn mini ${view === "passages" ? "" : "ghost"}`}
              onClick={() => setView("passages")}
              aria-pressed={view === "passages"}
              data-tip="your passages, each with its note and its concepts"
            >Passages</button>
            <button
              className={`btn mini ${view === "concepts" ? "" : "ghost"}`}
              onClick={() => setView("concepts")}
              aria-pressed={view === "concepts"}
              data-tip="your concepts, each with the passages that evidence it"
            >Concepts</button>
          </div>
          </div>
        )}

        <div className="scrollbox">
          {/* Empty means empty. A reading whose only capture is an unlabeled
              passage is not a blank warp, and it used to be told it was. */}
          {scoped.concepts.length === 0 && unlabeled.length === 0 && (
            <div className="empty">
              <svg width="34" height="18" viewBox="0 0 34 18" fill="none" stroke="#a39f92" strokeWidth="1.3"><path d="M2 13 L7 5 L12 13 L17 5 L22 13 L27 5 L32 13"/></svg>
              <span className="cap">your work fills as you lay warp</span>
            </div>
          )}
          {/* Three kinds, never three steps (TJ, 2026-08-09). Headings say what
              a concept IS relative to this reading, not how far along it is —
              see the note above `here`. A group with nothing in it is not
              drawn, so an empty heading never implies a gap to fill.

              Each heading NAMES ITS KIND (TJ, 2026-08-17: the labels "are
              ambiguous"). "In this reading" and "No evidence" said what was
              true of the rows without saying what the rows were, and the third
              group below is a list of PASSAGES — so the panel showed two kinds
              of thing under three headings, none of which said which. The
              rows have not changed; the headings now say concepts or passages
              outright.

              "No evidence" survives inside the longer heading because it is
              the model's own word and carries its own ruling — "a designation,
              never a warning to act on" — which is also why there is still no
              "yet" in any of them. */}
          {/* ONE LIST, AND THE CARD SAYS WHAT BACKS IT (TJ, 2026-08-18: "in
              'your work' we should handle the concepts with no evidence like
              we do in the warp"). The warp has always been one A-Z list with
              the fact on the row; this panel split the same concepts under
              "Concepts in this reading" and "Concepts with no evidence".

              The heading was not WRONG — `scope.ts`'s `isIn` is
              `evidenced.has(id) || !hasPassage.has(id)`, so a concept
              evidenced only in another text is in `scoped.outside` and never
              in this list, and "no evidence" here did mean nowhere. It was
              redundant, and it moved things: a concept jumped from one
              heading to the other the moment you filed a passage under it,
              which is a row changing place under the cursor at the instant
              you acted on it. The card carries the same fact without moving
              the row.

              "No evidence" is not lost, it moved onto the card — still the
              model's own word, still "a designation, never a warning to act
              on", still with no "yet" in it. */}
          {view === "concepts" && (
          <div>
          {sortedByLabel(scoped.concepts).map(concept => {
            const isOpen = openLogRows[concept.id]
            // This reading's evidence for the concept. A concept met in an
            // earlier text keeps that evidence — it is counted below rather
            // than shown here, so the log stays this reading's own work.
            const conceptPassages = scoped.passages.filter(b => b.conceptIds.includes(concept.id))
            
            return (
              <ConceptCard
                key={concept.id}
                concept={concept}
                passages={conceptPassages}
                /* This reading's evidence above, the whole loom here — the
                   card tells "nothing backs this anywhere" from "backed, but
                   not in this text" itself. */
                allPassages={state.passages}
                concepts={state.concepts}
                titleOf={titleOf}
                mode="edit"
                onGotoPassage={onGotoPassage}
                edit={{
                  isOpen: !!isOpen,
                  onToggle: () => toggleRow(concept.id),
                  onRename: (input) => handleRename(concept, input),
                  onEditDef: (def) => editConcept(concept.id, { def }),
                  onUnfilePassage: (passageId) => unfilePassage(passageId, concept.id),
                }}
              />
            )
          })}
          </div>
          )}

          {/* Your work is THIS reading's work (TJ, 2026-08-12). What used to
              close the list was a third group, "In your other readings" —
              every concept the student owns from every other text, listed
              here where none of them can be linked or filed. It grew with the
              term, so by week six the longest thing in Your work was the part
              that was not your work on this reading. Vocabulary is where you
              see them all; the note below keeps that door and the typing that
              reaches them, without the roll-call.

              What closes the list instead is the student's own capture that
              has no name yet — see `unlabeled` above. Last, because it is a
              designation and not a queue: nothing here has to be named, and
              an unlabeled passage may stay one forever. */}
          {/* THE UNLABELED GROUP IS GONE FROM HERE (TJ, 2026-08-17: "it seems
              like unnamed passages is now just part of passages and not in
              concepts"). It is, and that is the point of having two views.

              The group only ever existed because there was nowhere else to put
              a passage with no concept: a list OF CONCEPTS had to end with a
              list of passages, which is what made the panel show two kinds of
              thing under three headings. In the passage view an unlabeled
              passage is a row like any other whose chips happen to be absent,
              and that view is the one this panel opens on — so nothing is
              hidden, and red line #4 still holds: the empty state is visible,
              it is simply visible where it belongs. */}

          {/* THE PASSAGE VIEW. The same rows from the other end of the join:
              a passage, what it says, where it came from, the note you wrote
              on it, and the concepts it evidences.

              There is no "unlabeled" heading here and there does not need to
              be — a passage with no concepts simply has no chips, which is
              what it IS. The special case only existed because the other view
              had nowhere to put it.

              The note edits in place — `updatePassageNote` has existed since
              2026-08-17 (c1567ef), and `onEditNote` below wires it; the rail
              card and the capture form write the same field. An earlier
              version of this comment said the note could not be revised
              anywhere, and outlived the fix by two days. */}
          {view === "passages" && passagesAZ.map(b => (
            <PassageCard
              key={b.id}
              passage={b}
              concepts={state.concepts}
              titleOf={titleOf}
              mode="edit"
              onGoto={onGotoPassage}
              edit={{
                onEditNote: (note) => editPassageNote(b.id, note),
                onUnfile: (conceptId) => unfilePassage(b.id, conceptId),
                onRemove: () => removePassageWithConfirm(b),
                addOpen: addConceptFor === b.id,
                onToggleAdd: () => setAddConceptFor(cur => cur === b.id ? null : b.id),
                onCloseAdd: () => setAddConceptFor(null),
                onCreateConcept: addConcept,
                onAddConcept: addPassageConcept,
                onEditConcept: editConcept,
              }}
            />
          ))}
        </div>

        {/* Each note goes to the view it is about (TJ, 2026-08-17: "some of it
            goes with passages, some goes with concepts"). Both used to stand
            under one list, which is how they came to be read as one block of
            prose about nothing in particular.

            UNLABELED belongs to the passages, because that is where an
            unlabeled passage now lives — its group left the concept view when
            the passage view arrived. */}
        {view === "passages" && unlabeled.length > 0 && (
          <p className="ghostnote" style={{ marginTop: "10px" }}>
            <b>Unlabeled</b> is a state, not a fault — the passage is captured and it is
            yours. Name it when the word arrives, or never.
          </p>
        )}

        {/* And this one is about the CONCEPT list: what it holds, what it
            leaves out, and where the rest of your vocabulary is. */}
        {view === "concepts" && scoped.outside.length > 0 && (
          <p className="ghostnote" style={{ marginTop: "10px" }}>
            This list is this reading&apos;s work. Concepts you named in other readings
            are still offered as you type a concept above — filing a passage from here
            under one is what joins the two texts{onGotoVocabulary ? <> — and <button type="button" className="linkish" onClick={onGotoVocabulary}>Vocabulary</button> shows every concept you own</> : null}.
          </p>
        )}

        {/* Naming a concept BEFORE its evidence is a first-class move, not an
            oddity (TJ, 2026-08-08): you name what you expect to find, describe
            it, then read for support. It used to say "(rare)", which talked
            students out of it, and it took no description — so the gloss you
            had in mind at the moment of naming had nowhere to go. */}
        {/* Built like the capture form it sits beneath (TJ, 2026-08-13: "this
            card is not as evolved as its siblings"). It was: a `.quietrow`,
            whose own dotted top border drew a second rule directly under this
            block's, and a bare <input> for the gloss — no class, so it matched
            none of `textarea, .form-row input, .tinput` and fell back to the
            browser's own box, half the height of the field above it and
            clipping its own placeholder. Two `.form-row`s and a named field
            each, which is what every other pair of inputs in Loom is. */}
        {/* Concepts view only (TJ, 2026-08-17). Coining a concept ahead of its
            evidence is a statement about your vocabulary, not about any passage
            on this page — under a list of passages it read as a form belonging
            to the row above it. */}
        {view === "concepts" && (
        <NameConceptCard
          listId={listId}
          /* The homonym confirm rides with the act, in useCoinConcept — it
             warns and offers "Make a homonym" before coining (ruling 36), the
             same words from all three homes. */
          onAdd={handleAddConceptOnly}
        />
        )}
      </div>
  )

  // Two shapes, because the doorway differs (TJ, 2026-08-08).
  //
  // BESIDE A PDF THERE IS ONE DOORWAY: select the words. Typing is not offered
  // at all (TJ, 2026-08-13: "lets make it only visible in a reading without a
  // pdf"). It was a fold at the foot of Your work, justified by the things on a
  // page a highlight cannot hold — a concept map, a diagram's labels, a
  // photographed page. That justification never survived contact: you cannot
  // TYPE a diagram, you screen-grab it, so the card promised a use it could not
  // serve and every real use it had was a worse way to do what selecting does
  // (paraphrase where the rule is verbatim, a page number the viewer already
  // knows, and no offsets, so the passage never highlights and sits in the same
  // list as ones that do).
  //
  // A page with no text layer at all is a damaged reading, not a student's
  // problem to type around: that is what the repair pipeline is for.
  if (compact) {
    return (
      <div className="onecol">
        {conceptOptions}
        {/* The cloth names this work, so it sits at the head of it (TJ,
            2026-08-08). Folded: you are here to read and gather, and the
            title can wait as long as you like. */}
        <ClothFold openOnArrival={openClothFold} />
        {logCard}
      </div>
    )
  }

  // No text to select from — a reference-only reading the student minted for
  // something the library does not hold. Here typing IS the only doorway, so
  // the form leads.
  return (
    <>
      {conceptOptions}
      <ClothFold openOnArrival={openClothFold} />
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
