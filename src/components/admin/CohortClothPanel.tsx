"use client"

// THE COHORT MAP, and everything else floating on it.
//
// This is a map application, not a figure with a caption (TJ, 2026-08-22:
// "the map or graph needs to fill the screen like a google map or other
// application, cad, where the drawing is primary… you are treating the graph
// like an illustration for the text, it is not. the text is annotations for a
// map"). The drawing takes the whole viewport below the shell's bars; the
// title, the two lists and the read-out are overlays on it.
//
// What went, and why it was not content: the h1 and subtitle above the
// canvas, the card frame around it, and the read-out below it — "this whole
// thing is unnecessary and redundant, i excluded it from the example i
// shared". The read-out's CONTENT stayed and moved onto the canvas: the
// passages behind a concept live nowhere else in the app.
//
// The instructor inspects the weaving: a concept opens the passages behind
// it, an arc opens its thread. Every quote and sentence is shown as the
// student's own, with attribution — counted and quoted, never judged.
//
// CHOOSING HAPPENS IN BOTH PLACES AGAIN (TJ, 2026-08-22: "in the graph the
// links and the nodes should be selectable", and "selected concepts or links
// should highlight in the graph").
//
// From 2026-08-18 to 2026-08-22 the drawing could neither set the selection
// nor show it — the lists were the only way in, under the "all cloths
// hide/disable trace" ruling. That ruling stands for the cloths a student
// works on, where a node click gathers a pair for a throw; this one is
// read-only, so nothing competes for the click. `trace` on ClothMap is what
// scopes it here rather than everywhere.
//
// One `readSel` serves the drawing, both lists and the read-out, so a choice
// made anywhere lights everywhere.

import { useCallback, useMemo, useState } from "react"
import ClothMap from "@/components/svg/ClothMap"
import type { Passage, LoomState } from "@/lib/types"
import ConceptName from "@/components/ui/ConceptName"
import ConceptCard from "@/components/cards/ConceptCard"
import ThreadCard from "@/components/cards/ThreadCard"
import { labelOf } from "@/lib/linkResolve"
import { conceptNameText } from "@/lib/conceptName"

type ReadSel = { type: "concept" | "edge" | "hub"; id?: string; ids?: string[] } | null

type ConceptSort = "name" | "author" | "passages" | "crossings"
type ThreadSort = "from" | "author" | "described"

const CONCEPT_SORTS: { value: ConceptSort; label: string }[] = [
  { value: "name", label: "name" },
  { value: "author", label: "student" },
  { value: "passages", label: "passages" },
  { value: "crossings", label: "crossings" },
]
const THREAD_SORTS: { value: ThreadSort; label: string }[] = [
  { value: "from", label: "from" },
  { value: "author", label: "student" },
  { value: "described", label: "described" },
]

/** The panels' instructions, shown on hover rather than standing on the map. */
const CONCEPTS_TIP =
  "Every concept in the cohort's weave. Click one to light it on the map and open the passages behind it."
const THREADS_TIP =
  "Every thread thrown across the cohort. Click one to light it on the map and read it out below."


export default function CohortClothPanel({
  state,
  names,
  aggregateUnavailable = false,
  passagesUnavailable = false,
}: {
  state: LoomState
  /** userId → display name, for attributing concepts, passages, and threads. */
  names: Record<string, string>
  aggregateUnavailable?: boolean
  passagesUnavailable?: boolean
}) {
  const [readSel, setReadSel] = useState<ReadSel>(null)
  // Sort and filter per panel (TJ, 2026-08-22: "let the concept cards be
  // sortable and filterable. the threads panel is the same"). Local state,
  // not the URL: the course and section in the query string are the SCOPE —
  // what the map is of — and how a reader has arranged one of its lists is
  // not something to carry into a link or a back button.
  const [conceptSort, setConceptSort] = useState<ConceptSort>("name")
  const [conceptQuery, setConceptQuery] = useState("")
  const [threadSort, setThreadSort] = useState<ThreadSort>("from")
  const [threadQuery, setThreadQuery] = useState("")

  const conceptById = useMemo(
    () => new Map(state.concepts.map((c) => [c.id, c])),
    [state.concepts]
  )
  const passagesByConcept = useMemo(() => {
    const map = new Map<string, Passage[]>()
    state.passages.forEach((b) => {
      b.conceptIds.forEach((conceptId) => {
        const list = map.get(conceptId) ?? []
        list.push(b)
        map.set(conceptId, list)
      })
    })
    return map
  }, [state.passages])

  // useCallback so the sort/filter memos below can depend on it honestly
  // rather than on `names` while calling this — the two would drift the day
  // someone changed what "unknown" means.
  const who = useCallback((userId: string) => names[userId] ?? "unknown", [names])

  /** How many threads cross each concept. Once, not per row: sorting by it
   *  otherwise costs concepts × edges on every keystroke in the filter. */
  const degree = useMemo(() => {
    const d = new Map<string, number>()
    state.edges.forEach((e) => {
      d.set(e.fromId, (d.get(e.fromId) ?? 0) + 1)
      d.set(e.toId, (d.get(e.toId) ?? 0) + 1)
    })
    return d
  }, [state.edges])

  // Filter then sort, both panels. The filter is a plain substring over what
  // the row SHOWS — its name and its student — because that is what a reader
  // is looking at when they decide to narrow it.
  const shownConcepts = useMemo(() => {
    const q = conceptQuery.trim().toLowerCase()
    const rows = q
      ? state.concepts.filter(
          (c) =>
            conceptNameText(c).toLowerCase().includes(q) || who(c.userId).toLowerCase().includes(q)
        )
      : [...state.concepts]
    // Name is the tiebreak everywhere, so equal counts read alphabetically
    // rather than in the query's arbitrary row order.
    const byName = (a: typeof rows[number], b: typeof rows[number]) =>
      conceptNameText(a).localeCompare(conceptNameText(b))
    return rows.sort((a, b) => {
      switch (conceptSort) {
        case "author":
          return who(a.userId).localeCompare(who(b.userId)) || byName(a, b)
        case "passages":
          return (
            (passagesByConcept.get(b.id)?.length ?? 0) - (passagesByConcept.get(a.id)?.length ?? 0) ||
            byName(a, b)
          )
        case "crossings":
          return (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byName(a, b)
        default:
          return byName(a, b)
      }
    })
  }, [state.concepts, conceptQuery, conceptSort, passagesByConcept, degree, who])

  const shownThreads = useMemo(() => {
    const nameOf = (id: string) => {
      const c = conceptById.get(id)
      return c ? conceptNameText(c) : "?"
    }
    const q = threadQuery.trim().toLowerCase()
    const rows = q
      ? state.edges.filter((e) =>
          [nameOf(e.fromId), nameOf(e.toId), labelOf(e, state.links), e.sentence, who(e.userId)]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : [...state.edges]
    const byFrom = (a: typeof rows[number], b: typeof rows[number]) =>
      nameOf(a.fromId).localeCompare(nameOf(b.fromId)) || nameOf(a.toId).localeCompare(nameOf(b.toId))
    return rows.sort((a, b) => {
      switch (threadSort) {
        case "author":
          return who(a.userId).localeCompare(who(b.userId)) || byFrom(a, b)
        // Described first — an unsaid thread is the one needing attention, so
        // it is findable at the other end of the same sort.
        case "described":
          return (
            Number(!!b.sentence.trim()) - Number(!!a.sentence.trim()) || byFrom(a, b)
          )
        default:
          return byFrom(a, b)
      }
    })
  }, [state.edges, state.links, threadQuery, threadSort, conceptById, who])

  const selectConcept = (id: string) => {
    setReadSel(readSel?.type === "concept" && readSel.id === id ? null : { type: "concept", id })
  }
  const selectEdge = (id: string) => {
    setReadSel(readSel?.type === "edge" && readSel.id === id ? null : { type: "edge", id })
  }

  const passageQuote = (b: Passage) => (
    <div key={b.id} className="passagequote">
      <span className="src">
        {who(b.userId)}
        {b.source ? ` · ${b.source}` : ""}
        {b.location ? ` · ${b.location}` : ""}
      </span>
      <br />
      {b.content}
    </div>
  )


  // What is selected, read out ON the map — the student idiom, admin-voiced.
  let pane = null
  if (readSel?.type === "concept" && readSel.id) {
    const concept = conceptById.get(readSel.id)
    if (concept) {
      const conceptPassages = passagesByConcept.get(concept.id) ?? []
      const crossings = state.edges.filter(
        (e) => e.fromId === concept.id || e.toId === concept.id
      )
      pane = (
        <div>
          {/* The resting line. Everything the map cannot say about this
              concept — who owns it, how many threads cross it, what it
              means — and nothing that would grow the bar over the warp. */}
          <div className="threadhead">
            <span className="red">{conceptNameText(concept)}</span>
            <span className="n">
              {who(concept.userId)} · {crossings.length} crossing{crossings.length !== 1 ? "s" : ""} ·{" "}
              {conceptPassages.length} passage{conceptPassages.length !== 1 ? "s" : ""}
            </span>
            {concept.def ? <span className="footsaid">{concept.def}</span> : null}
          </div>

          {/* The evidence, folded. It is the page's whole purpose — "a concept
              opens the passages behind it" — so it stays reachable, but it
              opens on a click rather than pushing the map aside by default. */}
          <details className="footmore">
            <summary>
              <span className="tw">▸</span>
              the passages behind it ({conceptPassages.length})
              {crossings.length > 0 ? ` · the threads through it (${crossings.length})` : ""}
            </summary>
            {conceptPassages.length === 0 ? (
              <p className="ghostnote" style={{ color: "var(--red)" }}>
                No evidence — this concept traces to no captured passage yet.
              </p>
            ) : (
              conceptPassages.map(passageQuote)
            )}

            {crossings.length > 0 && (
              <>
                {/* The same card as the Threads list on the canvas — these ARE
                    those threads, seen from one of their ends, and drawing them
                    a second way was how `.readitem` and `.thread` came to say
                    the same thing differently. */}
                {crossings.map((e) => (
                  <ThreadCard
                    key={e.id}
                    thread={e}
                    from={conceptById.get(e.fromId)}
                    to={conceptById.get(e.toId)}
                    links={state.links}
                    by={who(e.userId)}
                    onSelect={() => selectEdge(e.id)}
                  />
                ))}
              </>
            )}
          </details>
        </div>
      )
    }
  } else if (readSel?.type === "edge" && readSel.id) {
    const edge = state.edges.find((e) => e.id === readSel.id)
    if (edge) {
      const ends = [conceptById.get(edge.fromId), conceptById.get(edge.toId)].filter(
        (c): c is NonNullable<typeof c> => Boolean(c)
      )
      pane = (
        <div>
          {/* The read-out's HEADING, not a card: it names what is being read
              out below it, in the red the panel uses for a selection, and the card
              for this same thread is already lit in the list. Its label is
              resolved the card's way though — `labelOf` first, the legacy
              `handle` only as a fallback — because a thread carrying a Link
              object and an empty handle used to read as unlabelled here. */}
          <div className="threadhead">
            <span className="red">{ends[0] ? conceptNameText(ends[0]) : "?"}</span>{" "}
            {labelOf(edge, state.links)
              ? <span className="vpill">{labelOf(edge, state.links)}</span>
              : <span className="vpill loosev">description</span>}{" "}
            <span className="red">{ends[1] ? conceptNameText(ends[1]) : "?"}</span>
            <span className="n">{who(edge.userId)}</span>
            {edge.sentence ? <span className="footsaid">&ldquo;{edge.sentence}&rdquo;</span> : null}
          </div>

          <details className="footmore">
            <summary>
              <span className="tw">▸</span>
              the passages behind both ends (
              {ends.reduce((n, c) => n + (passagesByConcept.get(c.id) ?? []).length, 0)})
            </summary>
            {ends.map((c) => (
              <div key={c.id} style={{ marginBottom: "12px" }}>
                <div className="label" style={{ marginTop: "8px" }}><ConceptName concept={c} /></div>
                {c.def ? (
                  <div style={{ fontSize: "13.5px", color: "var(--ink-soft)" }}>{c.def}</div>
                ) : null}
                {(passagesByConcept.get(c.id) ?? []).map(passageQuote)}
              </div>
            ))}
          </details>
        </div>
      )
    }
  }

  return (
    <>
      <div className="cohortcanvas">
        <div id="mapWrap">
          {/* The drawing selects, and shows what is selected (TJ, 2026-08-22:
              "selected concepts or links should highlight in the graph. in
              the graph the links and the nodes should be selectable").

              One `readSel` now serves three surfaces at once — the drawing,
              the two lists, and the read-out — so choosing in any of them
              lights the others. The panel→drawing direction is new: before
              this the cloth was passed a hard `null` and could not show a
              selection even when one existed. */}
          <ClothMap state={state} readSel={readSel} setReadSel={setReadSel} trace fill />
        </div>

        {/* The lists ride ON the canvas, at its top corners, so a concept read
            off the drawing is found without leaving it. */}
        {/* The page names itself for a screen reader and for nothing else.
            The visible title said "Cohort Graph" under a selected Cohort
            Graph tab, beside a course strip already naming the course, over a
            hint about quilting — TJ, 2026-08-22: "this seems unnecessary, the
            cohort graph tab is selected, the course is visible, quilting is
            irrelevant." None of that told a reader anything the chrome had
            not. The heading itself stays because a document with no h1 has no
            structure to hold on to; it simply takes no pixels. */}
        <h1 className="visually-hidden">Cohort Graph</h1>

        {/* A failed read is the one thing the map cannot show by drawing, so
            it says so in the open. Only rendered when something is wrong. */}
        {(aggregateUnavailable || passagesUnavailable) && (
          <div className="canvasnotice">
            {aggregateUnavailable && (
              <span>Aggregate data is temporarily unavailable. Check recent migrations and server logs.</span>
            )}
            {passagesUnavailable && (
              <span>Passage records could not be loaded. The concept/thread graph is still shown.</span>
            )}
          </div>
        )}

        {/* Both panels fold (TJ, 2026-08-22: "let the concepts panel be
            collapsible, same with threads") — on a map, a panel you are not
            using is in the way of the thing you are. `open` by default: they
            are how you find anything here.

            Their instructions are tips rather than standing prose (TJ: "this
            should be a tooltip or mouseover") — a line telling you to click
            the list costs the panel three lines forever and tells you once.
            Carried on aria-label too, since a tip is mouse-only. */}
        <details className="canvasmenu atleft" open>
          <summary data-tip={CONCEPTS_TIP} aria-label={`Concepts — ${CONCEPTS_TIP}`}>
            <span className="tw">▸</span>
            <h2>
              Concepts <span className="n">{state.concepts.length}</span>
            </h2>
          </summary>
          <div className="canvasfilter">
            <input
              className="tinput"
              type="search"
              value={conceptQuery}
              placeholder="filter concepts"
              aria-label="Filter concepts by name or student"
              onChange={(e) => setConceptQuery(e.target.value)}
            />
            <select
              className="tinput inline"
              value={conceptSort}
              aria-label="Sort concepts"
              onChange={(e) => setConceptSort(e.target.value as ConceptSort)}
            >
              {CONCEPT_SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {state.concepts.length === 0 ? (
            <p className="empty">Nothing woven yet.</p>
          ) : shownConcepts.length === 0 ? (
            // A filter that matches nothing says so, rather than showing an
            // empty box that reads as "the cohort wove nothing".
            <p className="empty">No concept matches &ldquo;{conceptQuery.trim()}&rdquo;.</p>
          ) : (
            <div className="scrollbox">
              {/* THE SHARED CARD, minified — the same move the Threads list
                  beside it makes. This was a hand-rolled `<div class="crow">`
                  carrying the name, the student and a passage tally: a
                  lookalike of ConceptCard rather than ConceptCard, while its
                  neighbour used the real ThreadCard. Neither the student nor
                  the tally is drawn now (TJ, 2026-08-22: "the concept cards
                  do not need student name or passage count") — the read-out
                  says both about whichever one is picked. */}
              {shownConcepts.map((c) => (
                <ConceptCard
                  key={c.id}
                  concept={c}
                  compact
                  selected={readSel?.type === "concept" && readSel.id === c.id}
                  onSelect={() => selectConcept(c.id)}
                />
              ))}
            </div>
          )}
        </details>

        <details className="canvasmenu atright" open>
          <summary data-tip={THREADS_TIP} aria-label={`Threads — ${THREADS_TIP}`}>
            <span className="tw">▸</span>
            <h2>
              Threads <span className="n">{state.edges.length}</span>
            </h2>
          </summary>
          <div className="canvasfilter">
            <input
              className="tinput"
              type="search"
              value={threadQuery}
              placeholder="filter threads"
              aria-label="Filter threads by concept, label, sentence or student"
              onChange={(e) => setThreadQuery(e.target.value)}
            />
            <select
              className="tinput inline"
              value={threadSort}
              aria-label="Sort threads"
              onChange={(e) => setThreadSort(e.target.value as ThreadSort)}
            >
              {THREAD_SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {state.edges.length === 0 ? (
            <p className="empty">Nothing thrown yet.</p>
          ) : shownThreads.length === 0 ? (
            <p className="empty">No thread matches &ldquo;{threadQuery.trim()}&rdquo;.</p>
          ) : (
            <div className="scrollbox">
              {/* THE SHARED CARD (docs/thread-card.md), `compact` here: from,
                  label, to and the state pill, and no sentence — this is a
                  list of 67 you scan, and the description belongs to the one
                  you pick, in the read-out below. `by` is dropped for the
                  same reason and needs no flag, being opt-in already.
                  `onSelect` still makes the whole card a target, which is
                  also where its keyboard comes from. */}
              {shownThreads.map((e) => (
                <ThreadCard
                  key={e.id}
                  thread={e}
                  from={conceptById.get(e.fromId)}
                  to={conceptById.get(e.toId)}
                  links={state.links}
                  compact
                  selected={readSel?.type === "edge" && readSel.id === e.id}
                  onSelect={() => selectEdge(e.id)}
                />
              ))}
            </div>
          )}
        </details>

        {/* The read-out, on the canvas. There is exactly one now: it used to
            sit below the drawing as a second column of page, which is the
            figure-with-caption shape TJ ruled against — "this is the
            unnecessary part". The CONTENT stays (the passages behind a
            concept live nowhere else); the furniture around it goes. */}
        <div className={`canvasfoot${pane ? "" : " idle"}`}>
          {pane ?? "Pick a concept or a thread — on the cloth or in the lists over it — to read it out here."}
        </div>
      </div>
    </>
  )
}
