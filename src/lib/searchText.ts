// The shared vocabulary between the search actions and the components that
// render their results.
//
// Postgres marks matches inside a snippet with ts_headline; these are the
// markers we ask it to use. They are characters no reading's prose plausibly
// contains, so a snippet can be split on them without an HTML parser — the
// UI renders segments as React text nodes and never touches innerHTML, which
// is what keeps a hostile PDF's text inert in the results list.
export const SNIPPET_OPEN = "⟦"
export const SNIPPET_CLOSE = "⟧"

export type SnippetSegment = { text: string; hit: boolean }

/** A ts_headline snippet as alternating plain/marked segments, in order. */
export function splitSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = []
  let rest = snippet
  while (rest.length > 0) {
    const open = rest.indexOf(SNIPPET_OPEN)
    if (open === -1) {
      segments.push({ text: rest, hit: false })
      break
    }
    if (open > 0) segments.push({ text: rest.slice(0, open), hit: false })
    const close = rest.indexOf(SNIPPET_CLOSE, open + 1)
    if (close === -1) {
      segments.push({ text: rest.slice(open + SNIPPET_OPEN.length), hit: true })
      break
    }
    segments.push({ text: rest.slice(open + SNIPPET_OPEN.length, close), hit: true })
    rest = rest.slice(close + SNIPPET_CLOSE.length)
  }
  return segments.filter((segment) => segment.text.length > 0)
}

/**
 * The distinct word forms Postgres actually marked, longest first.
 *
 * These are the document's own words (ts_headline wraps source text, not the
 * query), so "communities" comes back for a search on "community" — exactly
 * the strings a client-side marker can find again on the rendered page.
 * Longest first so a phrase is marked before its own words are.
 */
export function hitTermsOf(snippets: string[]): string[] {
  const byKey = new Map<string, string>()
  for (const snippet of snippets) {
    for (const segment of splitSnippet(snippet)) {
      if (!segment.hit) continue
      const term = segment.text.trim()
      if (term.length < 2) continue
      const key = term.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, term)
    }
  }
  return [...byKey.values()].sort((a, b) => b.length - a.length)
}
