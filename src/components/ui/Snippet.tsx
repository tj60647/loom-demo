"use client"

// A ts_headline snippet, rendered without ever touching innerHTML: the marker
// characters are split out (src/lib/searchText.ts) and the pieces become
// ordinary React text nodes, so text from a hostile PDF stays inert.

import { splitSnippet } from "@/lib/searchText"

export default function Snippet({ text }: { text: string }) {
  return (
    <>
      {splitSnippet(text).map((segment, index) =>
        segment.hit ? (
          <mark key={index} className="snipmark">{segment.text}</mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  )
}
