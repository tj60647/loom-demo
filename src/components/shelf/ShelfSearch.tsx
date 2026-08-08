"use client"

// One search, every scope (ruling 34): which of your readings says this —
// and which of your own concepts, links and passages do.
//
// Typing replaces the page with grouped results: readings first (a match in a
// text is a door back into it), then the student's own holdings by kind.
// Clearing the box puts the page back. Matching is plain text search (see
// src/actions/search.ts): words are stemmed, "quoted phrases" match exactly,
// -word excludes. No model anywhere near it.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { searchReadings, searchLoom, type ReadingSearchHit, type LoomSearchResult } from "@/actions/search"
import Snippet from "@/components/ui/Snippet"

export default function ShelfSearch({
  onActiveChange,
  onClose,
}: {
  /** True while a query is live and the results own the page. */
  onActiveChange: (active: boolean) => void
  /** Fold the search away — wired to Escape, mirroring the reading's panel. */
  onClose: () => void
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
    onActiveChange(active)
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
      Promise.all([searchReadings(trimmed), searchLoom(trimmed)])
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
  }, [query])

  const active = query.trim().length >= 2

  return (
    <div className="searchwrap">
      <div className="searchbar">
        <label className="label" htmlFor="shelfSearchInput">Search</label>
        <input
          id="shelfSearchInput"
          type="search"
          className="tinput searchinput"
          value={query}
          autoFocus
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose()
          }}
          placeholder='a word, or a "phrase"'
          aria-label="Search your readings for a word or phrase"
        />
      </div>

      {active && (
        <div className="searchresults" aria-live="polite">
          {error && <p className="hint" style={{ color: "var(--red)" }}>{error}</p>}

          {!error && results && results.length === 0 && !busy &&
            !loomResults?.concepts.length && !loomResults?.links.length && !loomResults?.passages.length && (
            <div className="empty">
              <span className="cap">nothing of yours matches that — readings, concepts, links or passages</span>
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

          {/* The student's own holdings, grouped by kind — scope 3/4 of the
              one search field (ruling 34). Each hit is a door to where that
              kind of work lives. */}
          {!error && loomResults && loomResults.concepts.length > 0 && (
            <>
              <span className="cap searchtally">your concepts</span>
              {loomResults.concepts.map((hit) => (
                <Link key={hit.id} href="/weave?tab=open" className="searchhit">
                  <div className="searchhithead"><h3>{hit.label}</h3></div>
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Link>
              ))}
            </>
          )}
          {!error && loomResults && loomResults.links.length > 0 && (
            <>
              <span className="cap searchtally">your links</span>
              {loomResults.links.map((hit) => (
                <Link key={hit.id} href="/weave?tab=throw" className="searchhit">
                  <div className="searchhithead">
                    <h3>
                      {hit.fromLabel} —[{hit.handle || "…"}]→ {hit.toLabel}
                    </h3>
                  </div>
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Link>
              ))}
            </>
          )}
          {!error && loomResults && loomResults.passages.length > 0 && (
            <>
              <span className="cap searchtally">your passages</span>
              {loomResults.passages.map((hit) => (
                <Link
                  key={hit.id}
                  href={hit.sourceId ? `/reading/${hit.sourceId}?tab=open` : "/weave?tab=open"}
                  className="searchhit"
                >
                  {hit.source ? <div className="searchhithead"><h3>{hit.source}</h3></div> : null}
                  <p className="searchsnip"><Snippet text={hit.snippet} /></p>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
