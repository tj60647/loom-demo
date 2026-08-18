"use client"

// One search, every scope (ruling 34): which of your readings says this —
// and which of your own concepts, link labels, links and passages do.
//
// Typing replaces the page with grouped results: readings first (a match in a
// text is a door back into it), then the student's own holdings by kind.
// Clearing the box puts the page back. Matching is plain text search (see
// src/actions/search.ts): words are stemmed, "quoted phrases" match exactly,
// -word excludes. No model anywhere near it.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { searchReadings, searchLoom } from "@/lib/reads"
import type { ReadingSearchHit, LoomSearchResult } from "@/actions/search"
import Snippet from "@/components/ui/Snippet"
import ConceptName from "@/components/ui/ConceptName"

/**
 * One result. A door when there is a reading to open, a plain row when there
 * is not — and it says which, rather than looking clickable and going nowhere.
 *
 * The three user-level kinds (a concept, a Link Label, a thread) used to lead
 * to `/weave` at library scope, because nothing else was every-reading-at-once.
 * TJ ruled the whole weave out of the app on 2026-08-11, so a hit now opens the
 * reading its work lives in — and when it has none, that is a state worth
 * showing plainly: a concept named ahead of its evidence is legal, and so is a
 * word coined before any thread uses it.
 */
/**
 * A door to a word in Vocabulary — the row, not the room.
 *
 * Concepts and Link Labels both live on 04, in two lists with two filters of
 * their own, so the kind decides which one to seed. Null when there is no
 * reading to open: a concept named ahead of its evidence, or a label coined
 * before any thread uses it, belongs to no text — `Hit` says so rather than
 * looking clickable and going nowhere.
 */
function vocabHref(sourceId: string | null | undefined, kind: "concept" | "label", value: string) {
  if (!sourceId) return null
  return `/reading/${sourceId}?tab=read&${kind}=${encodeURIComponent(value)}`
}

function Hit({
  href,
  nowhere,
  children,
}: {
  href: string | null
  /** What to say when there is no reading to open. */
  nowhere: string
  children: React.ReactNode
}) {
  if (href) return <Link href={href} className="searchhit">{children}</Link>
  return (
    <div className="searchhit off">
      {children}
      <p className="searchwhere"><span className="cap">{nowhere}</span></p>
    </div>
  )
}

export default function ShelfSearch({
  onClose,
  sourceId,
}: {
  /**
   * Fold the search away — wired to Escape and to the panel's ✕.
   *
   * `onActiveChange` stood beside this until 2026-08-13. It told the Library
   * that a query was live so the shelf could be REPLACED by the results (TJ:
   * "i do not like that the standing band takes up so much space"). The results
   * are in a panel over the page now, so there is nothing to hide and nothing
   * to put back: the shelf stays where it was, behind the search.
   */
  onClose: () => void
  /**
   * Contextual scope (TJ, 2026-08-10): absent, this is the Library's search
   * — the whole loom. Present, it is a reading's search — that reading's
   * pages, cloth, projections, and the concepts, link labels, links and passages here.
   */
  sourceId?: string
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ReadingSearchHit[] | null>(null)
  const [loomResults, setLoomResults] = useState<LoomSearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Monotonic request id: a slow early response must never overwrite a
  // later query's results, and bumping it orphans anything in flight.
  const requestRef = useRef(0)

  // State resets live in the change handler, not the effect — the effect only
  // schedules the fetch, so it never sets state synchronously.
  const handleChange = (value: string) => {
    setQuery(value)
    const active = value.trim().length >= 2
    if (!active) {
      requestRef.current++
      setResults(null)
      setLoomResults(null)
      setError(null)
      setBusy(false)
    }
  }

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return

    const requestId = ++requestRef.current
    const timer = window.setTimeout(() => {
      setBusy(true)
      // Readings and the student's own holdings, in parallel — one field,
      // results grouped by kind.
      Promise.all([searchReadings(trimmed, sourceId), searchLoom(trimmed, sourceId)])
        .then(([hits, loom]) => {
          if (requestRef.current !== requestId) return
          setResults(hits)
          setLoomResults(loom)
          setError(null)
        })
        .catch(() => {
          if (requestRef.current !== requestId) return
          setError("could not search just now")
        })
        .finally(() => {
          if (requestRef.current === requestId) setBusy(false)
        })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, sourceId])

  const active = query.trim().length >= 2

  return (
    <div className="searchwrap">
      {/* The scope is named on the button that opened this panel, not in here
          — see StationSearch. A placeholder cannot carry it: it disappears at
          the first keystroke, which is exactly when you start needing to know
          what you are searching. So this one only says what to type. */}
      <div className="searchbar">
        <input
          id="shelfSearchInput"
          type="search"
          className="tinput searchinput"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            // Clear AND close. The field is no longer permanent — it exists
            // only while the panel is open — so autoFocus is right here where
            // it would have been theft on a standing band.
            if (e.key === "Escape") {
              handleChange("")
              onClose()
            }
          }}
          placeholder='a word, or a "phrase"'
          autoFocus
        />
        <button type="button" className="btn ghost mini" onClick={onClose} aria-label="Close search">✕</button>
      </div>

      {active && (
        <div className="searchresults" aria-live="polite">
          {error && <p className="hint" style={{ color: "var(--red)" }}>{error}</p>}

          {!error && results && results.length === 0 && !busy &&
            !loomResults?.concepts.length && !loomResults?.links.length &&
            !loomResults?.linkLabels.length &&
            !loomResults?.passages.length && !loomResults?.cloths.length &&
            !loomResults?.projections.length && (
            <div className="empty">
              <span className="cap">
                {sourceId
                  ? "nothing in this reading matches that — pages, cloth, projections, concepts, link labels, links or passages"
                  : "nothing in your loom matches that — readings, cloths, projections, concepts, link labels, links or passages"}
              </span>
            </div>
          )}

          {!error && !results && <p className="hint">searching…</p>}

          {!error && results && results.length > 0 && (
            <>
              <span className="cap searchtally">
                {results.length} reading{results.length !== 1 ? "s" : ""} match
                {results.length === 1 ? "es" : ""}
              </span>
              {results.map((hit) => (
                // A hit is a door to the text itself, so it lands on
                // 00 · Reading with the query riding along — the reading's own
                // search opens pre-filled, marks and all. Workbench
                // re-validates the tab, so a card with no PDF simply falls
                // back to its first station.
                <Link
                  key={hit.sourceId}
                  href={`/reading/${hit.sourceId}?tab=reading&q=${encodeURIComponent(query.trim())}`}
                  className="searchhit"
                >
                  <div className="searchhithead">
                    <h3>{hit.title}</h3>
                    {hit.week != null && <span className="cap">week {hit.week}</span>}
                    {hit.isOwn && <span className="cap">your own</span>}
                  </div>
                  {hit.author ? <p className="shelfauthor">{hit.author}</p> : null}
                  <p className="searchwhere">
                    {[
                      hit.matchedCard ? "on its card" : null,
                      hit.pageHits > 0
                        ? `in ${hit.pageHits} page${hit.pageHits !== 1 ? "s" : ""}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {hit.excerpts.map((excerpt) => (
                    <p key={excerpt.pageNumber} className="searchsnip">
                      <span className="n">p. {excerpt.pageNumber}</span>
                      <Snippet text={excerpt.snippet} />
                    </p>
                  ))}
                </Link>
              ))}
            </>
          )}

          {/* The student's own holdings, grouped by kind — the loom half of
              the one search field (ruling 34). Each hit is a door to where
              that kind of work lives. */}
          {!error && loomResults && loomResults.cloths.length > 0 && (
            <>
              <span className="cap searchtally">your cloths</span>
              {loomResults.cloths.map((hit) => (
                // A cloth lives where its evidence is gathered: 01 · Reading,
                // where its Title and Description sit at the head of Your work
                // — inside a fold, which `cloth=1` opens, because those are the
                // words that matched.
                <Link key={hit.sourceId} href={`/reading/${hit.sourceId}?tab=reading&cloth=1`} className="searchhit">
                  <div className="searchhithead"><h3>{hit.title || "Base cloth"}</h3></div>
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Link>
              ))}
            </>
          )}
          {!error && loomResults && loomResults.projections.length > 0 && (
            <>
              <span className="cap searchtally">your projections</span>
              {loomResults.projections.map((hit) => (
                // A projection lives on the Knowledge Graph of its reading —
                // and there are several per reading, so name WHICH: the id
                // selects it on arrival rather than landing on whichever was
                // last active.
                <Link key={hit.id} href={`/reading/${hit.sourceId}?tab=map&projection=${encodeURIComponent(hit.id)}`} className="searchhit">
                  <div className="searchhithead"><h3>{hit.name}</h3></div>
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Link>
              ))}
            </>
          )}
          {!error && loomResults && loomResults.concepts.length > 0 && (
            <>
              <span className="cap searchtally">your concepts</span>
              {loomResults.concepts.map((hit) => (
                // In a reading, a concept hit stays in this workbench. At the
                // Library it opens the reading its first evidence is in.
                // Either way `concept=` carries the label into Vocabulary's own
                // filter, so you land on the ROW rather than on a list of every
                // word you own (TJ, 2026-08-13).
                <Hit
                  key={hit.id}
                  href={vocabHref(sourceId ?? hit.sourceId, "concept", hit.label)}
                  nowhere="named, with no passage behind it yet"
                >
                  {/* The href above keeps hit.label RAW: it round-trips through the URL into
     VocabularyTab's concept filter, which matches on the stored string. */}
                  <div className="searchhithead"><h3><ConceptName concept={hit} /></h3></div>
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Hit>
              ))}
            </>
          )}
          {!error && loomResults && loomResults.linkLabels.length > 0 && (
            <>
              <span className="cap searchtally">your link labels</span>
              {loomResults.linkLabels.map((hit) => (
                // A Link Label lives in Vocabulary, alongside the concepts —
                // and unlike a thread it can be found here before any thread
                // uses it, which is what made it an object (5.1). That is also
                // why it is the kind most likely to have no reading to open.
                <Hit
                  key={hit.id}
                  href={vocabHref(sourceId ?? hit.sourceId, "label", hit.label)}
                  nowhere="a label with no link using it yet"
                >
                  <div className="searchhithead">
                    <h3>{hit.label}</h3>
                    <span className="cap">
                      {hit.uses === 0 ? "not used yet" : `${hit.uses} thread${hit.uses !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Hit>
              ))}
            </>
          )}
          {!error && loomResults && loomResults.links.length > 0 && (
            <>
              <span className="cap searchtally">your links</span>
              {loomResults.links.map((hit) => (
                <Hit
                  key={hit.id}
                  href={sourceId ? `/reading/${sourceId}?tab=throw` : hit.sourceId ? `/reading/${hit.sourceId}?tab=throw` : null}
                  nowhere="thrown between concepts with no passage behind them yet"
                >
                  <div className="searchhithead">
                    <h3>
                      {hit.fromLabel} —[{hit.handle || "…"}]→ {hit.toLabel}
                    </h3>
                  </div>
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Hit>
              ))}
            </>
          )}
          {!error && loomResults && loomResults.passages.length > 0 && (
            <>
              <span className="cap searchtally">your passages</span>
              {loomResults.passages.map((hit) => (
                // An untethered passage has no reading by definition — the
                // Library's own "passages with no reading" card is where it
                // gets one, and that card is on this page already.
                <Hit
                  key={hit.id}
                  // `passage=` slides Your work out ON its row. `tab=open` is
                  // the legacy spelling of the Reading station and the
                  // Workbench folds it onto `reading` — kept per §F.
                  href={hit.sourceId ? `/reading/${hit.sourceId}?tab=open&passage=${encodeURIComponent(hit.id)}` : null}
                  nowhere="captured with no reading — say which, on the card below"
                >
                  {hit.source ? <div className="searchhithead"><h3>{hit.source}</h3></div> : null}
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Hit>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
