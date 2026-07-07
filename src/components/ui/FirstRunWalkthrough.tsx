"use client"
import { useState, useEffect } from "react"

const GUIDE = [
 {k:'how loom works', h:'Loom turns reading into weaving',
  p:'You read anywhere — book, PDF, screen — and bring the good bits here. Over three steps the pieces become a map of your own understanding. The tool holds the structure; you do all the thinking.',
  loom:'Three tabs = three moves, in order: 01 Open · 02 Throw · 03 Read.'},
 {k:'01 - open', h:'① Lay the warp',
  p:'Paste a passage and say what it\'s about in your own words. Crude is fine — "tools go invisible until they break" is a perfectly good concept. Each one joins your coding log.',
  loom:'Warp = your concepts: the threads held under tension first.'},
 {k:'02 - throw', h:'② Throw the weft',
  p:'Tap two of your concepts, then say — however awkwardly — how they hang together. That sentence is the connection. Optionally distil a short handle from your own words; the machine never names it for you.',
  loom:'Weft = the relations thrown across to bind the warp. Pick · pick · say · throw.'},
 {k:'03 - read', h:'③ Read the cloth',
  p:'Now read the whole weave: what argument runs through it, what it keeps returning to, what\'s missing. The tool points you to each as a question — you write the reading.',
  loom:'Look · trace · question · write. The reading is yours; the tool only counts and asks.'},
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

  const dismiss = () => {
    localStorage.setItem("loom_has_seen_walkthrough", "true");
    setShow(false);
  }

  if (!show) return null;

  const g = GUIDE[step];
  const isLast = step === GUIDE.length - 1;

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(26,25,22,.55)", 
      zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "22px"
    }}>
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
