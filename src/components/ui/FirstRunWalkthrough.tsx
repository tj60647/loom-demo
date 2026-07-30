"use client"
import { useState, useEffect } from "react"

const GUIDE = [
 {k:'how loom works', h:'Loom turns reading into weaving',
  p:'You read anywhere — paper, PDF, screen — marking what strikes you. Then you bring the best passages here. Over three moves, the pieces become a graph of your own understanding. The tool holds the structure; you do all the thinking.',
  loom:'Three tabs = three moves, in order: 01 Open · 02 Throw · 03 Read.'},
 {k:'01 — open', h:'① Capture and name',
  p:'Paste a passage worth keeping (a "byte"), with its citation. Name the concept it evidences — a short noun phrase, often the author\'s own term ("boundary objects"). Then gloss it in your own words in the working definition; crude is welcome there.',
  loom:'Warp = your concepts: the threads held under tension first. Choosing the passage is the judgment.'},
 {k:'02 — throw', h:'② Connect two concepts',
  p:'Tap two of your concepts, then say — however awkwardly — how they hang together. That sentence IS the connection. Later, coin a short term for it so a kind of link can recur; the machine never names it for you.',
  loom:'Weft = the relations thrown across to bind the warp. Pick · pick · say · throw.'},
 {k:'03 — read', h:'③ Read the whole cloth',
  p:'Now read the weave: what argument runs through it, what it keeps returning to, what\'s missing. The tool points at each as a question — counted, never judged — and you write the reading.',
  loom:'Look · trace · question · write. The reading is yours; the tool only counts and asks.'},
 {k:'04 — map', h:'④ Sort and arrange — the card table',
  p:'Sort your concepts into tiers (primary / secondary / tertiary), then drag the cards to arrange them — general above, specific below. The tool draws the links you already threw and counts what it sees; the sorting and arranging are yours.',
  loom:'Sort · arrange · check. Placement is the decision.'},
 {k:'after loom', h:'⑤ Where this goes next',
  p:'Your weave is the middle step, not the deliverable. Copy the map kit and draw your real concept map by hand (arranging is thinking), build your chalk talk from it, and export your graph (JSON) — yours to keep, submit, or explore further.',
  loom:'text → notes → concepts → weave → concept map → chalk talk → questions → discussion.'},
];

export default function FirstRunWalkthrough() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const hasSeen = localStorage.getItem("loom_has_seen_walkthrough");
    if (!hasSeen) {
      setTimeout(() => setShow(true), 0);
    }
  }, []);

  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setShow(true);
    };
    window.addEventListener("loom:walkthrough", reopen);
    return () => window.removeEventListener("loom:walkthrough", reopen);
  }, []);

  const dismiss = () => {
    localStorage.setItem("loom_has_seen_walkthrough", "true");
    setShow(false);
  }

  if (!show) return null;

  const g = GUIDE[step];
  const isLast = step === GUIDE.length - 1;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(26,25,22,.55)",
        zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "22px"
      }}
    >
      <div style={{
        maxWidth: "540px", width: "100%", background: "var(--paper)", border: "1px solid var(--ink)",
        borderRadius: "6px", boxShadow: "0 18px 50px rgba(0,0,0,.3)", padding: "24px 26px 20px", position: "relative"
      }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: "10px", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ochre)" }}>
          {g.k}
        </div>
        <h2 style={{ fontFamily: "var(--display)", fontSize: "25px", fontWeight: 600, margin: "6px 0 8px" }}>
          {g.h}
        </h2>
        <p style={{ fontSize: "15.5px", lineHeight: 1.5, margin: "0 0 10px" }}>
          {g.p}
        </p>
        <div style={{ fontSize: "13.5px", color: "var(--ink-soft)", borderLeft: "2px solid var(--ochre)", paddingLeft: "11px", margin: "12px 0" }}>
          {g.loom}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "18px", borderTop: "1px solid var(--rule)", paddingTop: "14px" }}>
          <span
            onClick={dismiss}
            style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--ink-soft)", cursor: "pointer", letterSpacing: ".04em" }}
          >
            {isLast ? '' : 'skip'}
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            {GUIDE.map((_, i) => (
              <span key={i} style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: i === step ? "var(--ochre)" : "var(--rule)",
                cursor: "pointer"
              }} onClick={() => setStep(i)} />
            ))}
          </div>
          <button
            className="btn ghost mini"
            onClick={() => isLast ? dismiss() : setStep(s => s + 1)}
            style={{ margin: 0 }}
          >
            {isLast ? "Start weaving" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  )
}
