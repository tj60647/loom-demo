import type { SourceScore } from "@/lib/types"

/**
 * Renders a reading's extraction-quality score.
 *
 * Two rules the display has to hold to, both inherited from how the score is
 * computed: an unscored dimension shows as "—" rather than 0, and a heuristic
 * row is visibly distinguished from a judged one, so nobody reads a pending
 * legibility score as a final verdict.
 */

type ScoreRow = Pick<
  SourceScore,
  | "status"
  | "coverage"
  | "legibility"
  | "anchorability"
  | "structure"
  | "overall"
  | "pass"
  | "notes"
  | "judgeNotes"
  | "judgeModel"
> & { metrics: SourceScore["metrics"] }

function band(value: number | null) {
  if (value == null) return "—"
  return value.toFixed(1)
}

/** Colour tracks usability, not the raw number: 4–5 fine, 3 borderline, ≤2 bad. */
function toneFor(value: number | null) {
  if (value == null) return "var(--grey)"
  if (value >= 4) return "var(--sage)"
  if (value >= 3) return "var(--ochre)"
  return "var(--red)"
}

function Dimension({ label, value, title }: { label: string; value: number | null; title: string }) {
  return (
    <span
      title={title}
      style={{
        fontFamily: "var(--mono)",
        fontSize: "11px",
        letterSpacing: ".04em",
        color: toneFor(value),
        whiteSpace: "nowrap",
      }}
    >
      {label} {band(value)}
    </span>
  )
}

export default function ExtractionScore({ score }: { score: ScoreRow | null }) {
  if (!score) {
    return (
      <span className="pill loose" title="This reading has not been scored yet">
        Unscored
      </span>
    )
  }

  if (score.status === "unscorable") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span className="pill" style={{ color: "var(--red)", border: "1px solid var(--red)" }}>
          No text layer
        </span>
        <span className="hint" style={{ fontSize: "12px" }}>{score.notes}</span>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <span
          className="pill"
          style={{ color: toneFor(score.overall), border: `1px solid ${toneFor(score.overall)}` }}
          title="Mean of the scored dimensions"
        >
          Extraction {band(score.overall)}
        </span>
        {score.pass === false ? (
          <span className="pill" style={{ color: "var(--red)", border: "1px dashed var(--red)" }}>
            Needs review
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Dimension
          label="cov"
          value={score.coverage}
          title="Coverage — share of pages with extractable text"
        />
        <Dimension
          label="leg"
          value={score.legibility}
          title="Legibility — whether the extracted characters are readable text rather than garble"
        />
        <Dimension
          label="anc"
          value={score.anchorability}
          title="Anchorability — whether pages carry enough text for highlight offsets to hold"
        />
        <Dimension
          label="str"
          value={score.structure}
          title={
            score.structure == null
              ? "Structure — not scored: the reading-order check needs the LLM judge"
              : "Structure — whether extraction preserved reading order"
          }
        />
      </div>

      {score.notes ? (
        <span className="hint" style={{ fontSize: "12px" }}>{score.notes}</span>
      ) : null}
      {score.judgeNotes ? (
        <span className="hint" style={{ fontSize: "12px", fontStyle: "italic" }}>
          {score.judgeNotes}
        </span>
      ) : null}

      <span className="cap">
        {score.status === "judged"
          ? `judged · ${score.judgeModel ?? "unknown model"}`
          : "measured only — reading-order check pending"}
      </span>
    </div>
  )
}
