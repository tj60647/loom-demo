"use client"

/**
 * Help with the hard part: naming the concept a passage evidences.
 *
 * ONE component, used by both doorways (TJ, 2026-08-13). It lived inline in
 * `CaptureModal` and again in `OpenTab`, copied — same scaffold, same chips,
 * same "still stuck?" ladder, same inline styles — and the two copies had
 * already drifted: the modal reassured you that "you don't need a clever term"
 * and the typed form did not. Two places to edit is how a teaching surface ends
 * up saying two different things about one act.
 *
 * It belongs UNDER the Concept field, which is what it coaches. The modal
 * always had it there; the typed form had it above, inside the passage
 * textarea's row, so forty lines of naming advice sat between the passage and
 * the field they were about.
 *
 * The chips are the real instrument: naming is where a student stalls, and the
 * way out is not a cleverer word but the author's own. Tapping builds the noun
 * phrase from the passage a word at a time.
 */

import { contentWords } from "@/lib/utils"

export default function ConceptNamingAssist({ passage, value, onChange, conceptOptional = false }: {
  /** The passage being named — the words you tap come from it. */
  passage: string
  /** The concept label as it stands. */
  value: string
  /** Called with the whole label once a word has been appended. */
  onChange: (next: string) => void
  /**
   * Whether the passage can be kept with no concept on it. TRUE for a
   * highlight, where an Unlabeled capture is a whole act; FALSE for the typed
   * form, whose Add passage button will not enable without one. The two
   * copies differed on exactly this line, and it is the one difference between
   * them that was never drift — saying "or leave it empty" beside a disabled
   * button would be a straightforward lie.
   */
  conceptOptional?: boolean
}) {
  const words = contentWords(passage)

  return (
    <div className="scaffold" style={{ marginTop: "10px" }}>
      <div className="snote" style={{ fontSize: "12px" }}>
        {/* Both spaces around the bold run are explicit. Reflowing this
            sentence across lines ate the one after </b> and shipped
            "…carry the pointand tap…" — JSX trims a text chunk's first line,
            and the chunk began with that space. */}
        Stuck naming it? You don&apos;t need a clever term —{" "}
        <b>point at the words in the passage that carry the point</b>{" "}
        and tap to build the concept from the author&apos;s own words.
      </div>

      {/* Empty only in the typed form, where you write the passage yourself and
          may reach this field first. A highlight always arrives with its text. */}
      {words.length > 0 ? (
        <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
          {words.map((w) => (
            <span
              key={w}
              className="chip"
              role="button"
              tabIndex={0}
              title={`add “${w}” to the concept`}
              onClick={() => onChange(value ? `${value} ${w}` : w)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onChange(value ? `${value} ${w}` : w)
                }
              }}
              style={{
                fontFamily: "var(--mono)", fontSize: "12px", background: "#fff",
                border: "1px solid var(--rule)", borderRadius: "12px",
                padding: "3px 9px", cursor: "pointer", color: "var(--ink)",
              }}
            >{w}</span>
          ))}
        </div>
      ) : (
        <div className="snote" style={{ fontStyle: "italic", fontSize: "12px", marginTop: "8px", marginBottom: 0 }}>
          …write the passage above and its words appear here to tap.
        </div>
      )}

      <details className="ladder">
        <summary style={{ color: "var(--sage)" }}>still stuck? a few ways in</summary>
        <ul>
          <li>What is this passage an <b>example of</b>?</li>
          <li>Tell a friend what this bit is about in <b>five words</b>.</li>
          <li>What&apos;s the <b>one move</b> the author is making here?</li>
          <li className="eg">
            Just to show the shape — concepts as noun phrases: &nbsp;
            <i>&ldquo;boundary objects&rdquo; · &ldquo;the central tension&rdquo;</i>
          </li>
        </ul>
        <div className="snote" style={{ marginTop: "6px", fontSize: "12px", marginBottom: 0 }}>
          A concept can be a phrase, not a word. It&apos;s provisional — rename it later,
          or type an existing name to reuse it.
          {conceptOptional && " Or leave it empty: the passage is kept either way, and you can name it whenever the word arrives."}
        </div>
      </details>
    </div>
  )
}
