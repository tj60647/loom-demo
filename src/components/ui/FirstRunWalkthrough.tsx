"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"

/** Pre-per-user key; still read once so existing students aren't re-onboarded. */
const LEGACY_SEEN_KEY = "loom_has_seen_walkthrough"

const GUIDE = [
 {k:'how loom works', h:'Loom turns reading into weaving',
  p:'You read anywhere — paper, PDF, screen — marking what strikes you. Then you bring the best passages here. Over three moves, the pieces become a graph of your own understanding. The tool holds the structure; you do all the thinking.',
  loom:'Three moves, in order: 01 Reading · 02 Linking · 03 Knowledge Graph, where you lay it out and read it. 04 Vocabulary is the words you have collected along the way, and 00 Library is where you start. Every object you make downloads where you made it. Never done this? Press practice in the header — the same interface, a worked example already in it, and nothing kept.'},
 {k:'01 — reading', h:'① Read, capture and name',
  p:'The text and your captures are one place. Highlight a passage in the reading — or paste one with its citation — and name the concept it evidences: a short noun phrase, often the author\'s own term ("boundary objects"). Gloss it in your own words in the description; crude is welcome there. Your work slides out over the text.',
  loom:'Warp = your concepts: the threads held under tension first. Choosing the passage is the judgment.'},
 {k:'02 — throw', h:'② Connect two concepts',
  p:'Tap two of your concepts, then say — however awkwardly — how they hang together. That sentence IS the connection. Later, coin a short label for it so a kind of link can recur; the machine never names it for you.',
  loom:'Weft = the relations thrown across to bind the warp. Pick · pick · say · throw.'},
 {k:'03 — knowledge graph', h:'③ Sort, arrange, and read the cloth',
  p:'Sort your concepts into tiers (primary / secondary / tertiary) on the list, then drag the cards to arrange them on the board — general above, specific below. Below the board the cloth shows you what it counts — the spine, the centre, the gap — as questions, and you write the read.',
  loom:'Sort · arrange · check, then look · trace · question · write. Placement and reading are both yours.'},
 {k:'04 — vocabulary', h:'④ The words you own',
  p:'Every concept you have named and every label you have coined, across all your readings — not just this one. Sharpen a description, see which words are recurring, and merge two entries if you named the same idea twice.',
  loom:'A concept does not belong to a reading; a passage does. This is your lexicon.'},
 {k:'after loom', h:'⑤ Where this goes next',
  p:'Your weave is the middle step, not the deliverable. Copy the concept-map kit and draw your real concept map by hand (arranging is thinking), and build your chalk talk from it. Everything downloads where it was made — the cloth at 01, its threads at 02, a projection and your Capture Log at 03, your vocabulary at 04 — yours to keep, submit, or explore further.',
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
  // Mounted once in the root layout so the header's "?" always has a listener.
  // It therefore has to decide for itself where the unprompted pop-up is
  // welcome: the learner surfaces, not the admin shell or the sign-in screens.
  // Opening BY THE BUTTON still works everywhere — that is the point.
  const pathname = usePathname();
  const welcome =
    autoOpen && !(pathname?.startsWith("/admin") || pathname?.startsWith("/auth"));
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  // Keyed per student: a shared lab machine used to swallow the walkthrough
  // for everyone after the first sign-in. Null when signed out, where the
  // walkthrough is reachable from "?" but is never marked seen for anybody.
  const userId = session?.user?.id;
  const storageKey = userId ? `${LEGACY_SEEN_KEY}:${userId}` : null;

  useEffect(() => {
    if (!welcome || !storageKey) return;
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
  }, [welcome, storageKey]);

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
