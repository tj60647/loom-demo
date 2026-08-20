"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"

/** Pre-per-user key; still read once so existing students aren't re-onboarded. */
const LEGACY_SEEN_KEY = "loom_has_seen_walkthrough"

const GUIDE = [
 {k:'how loom works', h:'Loom turns reading into weaving',
  p:'You read anywhere — paper, PDF, screen — marking what strikes you. Then you bring the best passages here. Over four moves, the pieces become a graph of your own understanding. The tool holds the structure; you do all the thinking.',
  loom:'Library is where you start. Inside a reading, Capture · Connect · Reflect · Map turn it into a weave. Export & backup is where your work comes out.'},
 {k:'capture', h:'① Capture and name',
  p:'Paste a passage worth keeping (a "byte"), with its citation. Name the concept it evidences — a short noun phrase, often the author\'s own term ("boundary objects"). Then gloss it in your own words in the working definition; crude is welcome there.',
  loom:'Warp = your concepts: the threads held under tension first. Choosing the passage is the judgment.'},
 {k:'connect', h:'② Connect two concepts',
  p:'Tap two of your concepts, then say — however awkwardly — how they hang together. That sentence IS the connection. Later, coin a short term for it so a kind of link can recur; the machine never names it for you.',
  loom:'Weft = the relations thrown across to bind the warp. Pick · pick · say · throw.'},
 {k:'reflect', h:'③ Reflect on the whole cloth',
  p:'Now read the weave: what argument runs through it, what it keeps returning to, what\'s missing. The tool points at each as a question — counted, never judged — and you write the reading.',
  loom:'Look · trace · question · write. The reading is yours; the tool only counts and asks.'},
 {k:'map', h:'④ Sort and arrange — the card table',
  p:'Sort your concepts into tiers (primary / secondary / tertiary), then drag the cards to arrange them — general above, specific below. The tool draws the links you already threw and counts what it sees; the sorting and arranging are yours.',
  loom:'Sort · arrange · check. Placement is the decision.'},
 {k:'after loom', h:'⑤ Where this goes next',
  p:'Your weave is the middle step, not the deliverable. Copy the map kit and draw your real concept map by hand (arranging is thinking), build your chalk talk from it, and export your graph from Export & backup (JSON) — yours to keep, submit, or explore further.',
  loom:'text → notes → concepts → weave → concept map → chalk talk → questions → discussion.'},
];

/**
 * `autoOpen` gates only the unprompted first-visit pop-up. The component is
 * mounted signed-out too, so the header's "?" can always open it — a visitor
 * can read what Loom is before committing to a sign-in — but the sign-in
 * screen stays quiet.
 */
export default function FirstRunWalkthrough({ autoOpen = true }: { autoOpen?: boolean }) {
  const { data: session } = useSession();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  // Keyed per student: a shared lab machine used to swallow the walkthrough
  // for everyone after the first sign-in. Null when signed out, where the
  // walkthrough is reachable from "?" but is never marked seen for anybody.
  const userId = session?.user?.id;
  const storageKey = userId ? `${LEGACY_SEEN_KEY}:${userId}` : null;

  useEffect(() => {
    if (!autoOpen || !storageKey) return;
    // Adopt the pre-per-user flag once, then clear it, so this student keeps
    // their "already seen" state without suppressing the next student's.
    const legacy = localStorage.getItem(LEGACY_SEEN_KEY);
    if (legacy) {
      localStorage.setItem(storageKey, legacy);
      localStorage.removeItem(LEGACY_SEEN_KEY);
    }
    if (!localStorage.getItem(storageKey)) {
      const timer = window.setTimeout(() => setShow(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [autoOpen, storageKey]);

  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setShow(true);
    };
    window.addEventListener("loom:walkthrough", reopen);
    return () => window.removeEventListener("loom:walkthrough", reopen);
  }, []);

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, "true");
    setShow(false);
  }

  if (!show) return null;

  const g = GUIDE[step];
  const isLast = step === GUIDE.length - 1;

  // Uses the ported .scrim/.guide classes rather than restating them inline,
  // so the overlay stays in step with the rest of the visual language.
  return (
    <div className="scrim show" onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="guide">
        <div className="gk">{g.k}</div>
        <h2>{g.h}</h2>
        <p>{g.p}</p>
        <div className="gloom">{g.loom}</div>

        <div className="gnav">
          <span className="skip" onClick={dismiss}>{isLast ? '' : 'skip'}</span>
          <div className="dots">
            {GUIDE.map((_, i) => (
              <span
                key={i}
                className={`dot ${i === step ? 'on' : ''}`}
                style={{ cursor: "pointer" }}
                onClick={() => setStep(i)}
              />
            ))}
          </div>
          <button className="btn" onClick={() => isLast ? dismiss() : setStep(s => s + 1)} style={{ margin: 0 }}>
            {isLast ? "Start weaving" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  )
}
