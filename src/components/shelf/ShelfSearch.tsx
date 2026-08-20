"use client"

// Search across the shelf: which of your readings says this?
//
// Typing replaces the week-grouped shelf with ranked results — a reading per
// row, with the page or two where the match lands. Clearing the box puts the
// shelf back. Matching is plain text search (see src/actions/search.ts):
// words are stemmed, "quoted phrases" match exactly, -word excludes.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { searchReadings, type ReadingSearchHit } from "@/actions/search"
import Snippet from "@/components/ui/Snippet"
import { useReadings } from "@/components/providers/ReadingsProvider"

export default function ShelfSearch({
  onActiveChange,
  onClose,
}: {
  /** True while a query is live and the results own the page. */
  onActiveChange: (active: boolean) => void
  /** Fold the search away — wired to Escape, mirroring the reading's panel. */
  onClose: () => void
}) {
  const { frontendOnly, readings, selectReading } = useReadings()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ReadingSearchHit[] | null>(null)
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
      const search = frontendOnly
        ? Promise.resolve(readings.filter((reading) => `${reading.title} ${reading.author ?? ""} ${reading.description ?? ""}`.toLowerCase().includes(trimmed.toLowerCase())).map((reading): ReadingSearchHit => ({ sourceId: reading.id, title: reading.title, author: reading.author, week: reading.week, isOwn: reading.isOwn, hasFile: !!reading.storageKey || !!reading.isPreview, matchedCard: true, pageHits: 0, excerpts: [] })))
        : searchReadings(trimmed)
      search
        .then((hits) => {
          if (requestRef.current !== requestId) return
          setResults(hits)
          setError(null)
        })
        .catch(() => {
          if (requestRef.current !== requestId) return
          setError("could not search your readings just now")
        })
        .finally(() => {
          if (requestRef.current === requestId) setBusy(false)
        })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [frontendOnly, query, readings])

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

          {!error && results && results.length === 0 && !busy && (
            <div className="empty">
              <span className="cap">none of your readings matches that</span>
            </div>
          )}

          {!error && !results && <p className="hint">searching your readings…</p>}

          {!error && results && results.length > 0 && (
            <>
              <span className="cap searchtally">
                {results.length} reading{results.length !== 1 ? "s" : ""} match
                {results.length === 1 ? "es" : ""}
              </span>
              {results.map((hit) => (
                // A PDF-backed hit is a door to its source text, with the query
                // riding along; a reference-only hit opens Capture instead.
                <Link
                  key={hit.sourceId}
                  href={`/studio/reading/${hit.sourceId}?tool=${hit.hasFile ? "source" : "capture"}${hit.hasFile ? `&q=${encodeURIComponent(query.trim())}` : ""}`}
                  className="searchhit"
                  onClick={() => selectReading(hit.sourceId)}
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
        </div>
      )}
    </div>
  )
}
