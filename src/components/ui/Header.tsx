"use client"
import { useState, useSyncExternalStore } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import AuthButton from "./AuthButton"
import MyLoomModal from "./MyLoomModal"
import FullscreenIcon from "./FullscreenIcon"
import GuideIcon from "./GuideIcon"
import HeaderMenu from "./HeaderMenu"

/** Module-level so the store identity is stable across renders. */
const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange)
  return () => document.removeEventListener("fullscreenchange", onChange)
}

export default function Header({ deployEnv, isBranchPreview = false }: { deployEnv?: string; isBranchPreview?: boolean }) {
  const { data: session } = useSession()
  const [showAbout, setShowAbout] = useState(false)
  const [showMyLoom, setShowMyLoom] = useState(false)
  const pathname = usePathname()
  // The practice loom. My Loom still opens here — the Header sits ABOVE
  // SandboxLoomProvider in the tree (layout.tsx wraps it in the real
  // LoomProvider), so the counts shown are the student's actual work and are
  // correct. Start over is what gets suppressed: offering to clear a real loom
  // from the page that promises nothing is kept is a confusion worth avoiding
  // even though the call would do exactly what it says.
  const inSandbox = pathname?.startsWith("/sandbox") ?? false

  /**
   * The whole screen, from every page (TJ, 2026-08-12).
   *
   * WHY IT EARNS A SLOT IN THE HEADER. Vertical is the scarce axis on a
   * desktop (contracts.md §2c-iii): at the 1280×800 floor there is ~600px of
   * usable height under the chrome, and the browser's own tab strip and URL
   * bar are ~90–120px of what is left. F11 has always done this; almost
   * nobody presses F11.
   *
   * NOT THE SAME CONTROL as the reading toolbar's "full screen text", which
   * since 2026-08-17 does BOTH halves — the in-app chrome hiding and the
   * browser's Fullscreen API — so the text fills the physical screen. This one
   * gives the whole app the screen and keeps Loom's own chrome. See the note
   * on the button below for why only that label carries a qualifier.
   *
   * The state is read from the DOCUMENT, never from what we last asked for:
   * Esc, F11 and the browser's own affordances all leave fullscreen without
   * telling us, and a label that only tracked our own clicks would start
   * lying at the first Esc.
   */
  const isFull = useSyncExternalStore(subscribeFullscreen, () => !!document.fullscreenElement, () => false)
  const canFull = useSyncExternalStore(subscribeFullscreen, () => !!document.fullscreenEnabled, () => false)
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // A refused request (a policy, a gesture the browser did not count) is
      // not a failure worth a dialog — the button simply does not latch.
    }
  }
  // Anywhere that isn't the real site wears the red weft through the mark —
  // the same clue as the favicon and the dev OAuth app's logo.
  const isDev = deployEnv !== "production"

  return (
    <>
      <header>
        <div className="wordmark">
          <svg width="17" height="12" viewBox="0 0 26 18" fill="none" strokeWidth="1.8">
            <path d="M2 15 L7 4 L12 15 L17 4 L22 15" stroke="#a8843f"/>
            {isDev && <path d="M1 9.5 L23 9.5" stroke="#b23a2b" strokeWidth="1.6"/>}
          </svg>
          <div>
            Loom
            <small>
              lay the warp · throw the weft
              {isDev && <span style={{ color: "var(--red)" }}> · dev</span>}
            </small>
          </div>
        </div>
        <div className="spacer"></div>
        {/* The save light moved to the journey bar (TJ, 2026-08-17) — see
            SaveLight.tsx. It has to survive the reading station, and the
            reading station is where this header stands down. */}
        <AuthButton isBranchPreview={isBranchPreview} />
        {/* About, My loom and Workflows fold into the menu (TJ, 2026-08-17).
            None is a control you reach for while working — you open your loom
            to look at it, read your flow once, or read what Loom is — so
            three standing buttons was header room spent every second of every
            session on things pressed a handful of times.

            Their old notes, kept because the reasoning still holds and only
            the slot changed:

            MY LOOM sat between About and Workflows (TJ, 2026-08-13). The slot
            was the argument: a whole-loom surface had nowhere to live once
            Keep was deleted, and a station is the thing that was deleted — so
            it is chrome, like About beside it. Session-gated, because an
            empty loom is a fact about a student and there is no student here
            without one. See MyLoomModal for why it is a mirror, never a
            workshop.

            WORKFLOWS is no longer offered to students at all (TJ,
            2026-08-17) — see HeaderMenu. Staff reach it through the journey
            bar's staff group, which has carried it since 2026-08-09. */}
        <HeaderMenu
          onAbout={() => setShowAbout(true)}
          onMyLoom={() => setShowMyLoom(true)}
          showMyLoom={!!session}
        />
        {/* The practice loom, on every page (TJ, 2026-08-11: "the guide should
            always be available, like the tutorials in any game. if the sandbox
            is the guide, then it should be clearly accessible"). It was
            reachable only by typing the URL until this week, and then only
            from a Library card that shows on an empty loom — so the one
            student who could find it was the one who had not started. A
            tutorial you can only reach before you need it is not a tutorial. */}
        {session && (
          <Link
            href="/sandbox"
            className="btn ghost mini iconly"
            data-tip="the guide — walk every move on a real reading, nothing is kept"
            aria-label="The guide — walk every move on a real reading"
          >
            <GuideIcon />
          </Link>
        )}
        {/* Beside the guide, per TJ. Hidden where the browser will not grant
            it (an iframe without allowfullscreen, a locked-down kiosk) rather
            than offered and dead.

            Two different screens-full, and the reading station shows both:
            this one gives LOOM the whole screen — journey bar, scope bar and
            all, with only the browser's own chrome dropped — and works on
            every station. The toolbar's "full screen text" gives the TEXT the
            whole screen, which means Loom's chrome goes too.

            The qualifier sits on the toolbar's label, not this one, for a
            measured reason: at the 1280 floor the header has room for an
            11-character label and no more. "full screen app" is 15 and wraps
            the header to two rows — 52px on the scarce axis (contracts.md
            §2c-iii), which costs more than the naming gains. */}
        {session && canFull && (
          <button
            className="btn ghost mini iconly"
            onClick={toggleFull}
            aria-pressed={isFull}
            aria-label={isFull ? "Exit full screen" : "Full screen — Loom fills the screen"}
            data-tip={isFull ? "back to the browser (esc)" : "give Loom the whole screen"}
          >
            <FullscreenIcon exit={isFull} />
          </button>
        )}
      </header>

      {showMyLoom && (
        <MyLoomModal onClose={() => setShowMyLoom(false)} allowReset={!inSandbox} />
      )}

      {/* Same ink scrim as every other overlay — the light blurred backdrop
          was the one exception to the app's visual language. */}
      {showAbout && (
        <div className="info-scrim" onClick={(e) => { if (e.target === e.currentTarget) setShowAbout(false) }}>
          <div className="info-dialog aboutbox" role="dialog" aria-modal="true" aria-label="About Loom">
            <button className="btn ghost mini info-close" onClick={() => setShowAbout(false)} aria-label="Close">✕</button>

            <span className="info-k">about</span>
            <h2>Loom</h2>
            <p className="info-note">Weaving knowledge through shared practice.</p>

            <p>Loom turns reading into weaving. You read anywhere — paper, PDF, screen — and bring the passages worth keeping here, where they become concepts, the concepts get threaded to one another, and the whole thing lays out as something you can read back. The structure is yours: the tool holds it and counts it, and never writes a word of it.</p>

            <h3>The five stations</h3>
            <ul>
              <li><b>00 Library</b> — the course&apos;s readings. Each card opens its own workbench, and the work you do behind it belongs to that text.</li>
              <li><b>01 Reading</b> — the text and your captures in one place. Highlight a passage, name the concept it evidences, and title your cloth: your own reading of the text as a whole.</li>
              <li><b>02 Linking</b> — pick two concepts and say how they hang together. That sentence IS the thread; a short label is a convenience that lets one of your words recur.</li>
              <li><b>03 Knowledge Graph</b> — sort your concepts into tiers and arrange them as cards on a board. Each arrangement is a projection: keep several, and each can say something different about the same cloth.</li>
              <li><b>04 Vocabulary</b> — every concept you have named and every label you have given a link, across all your readings. A concept does not belong to a text; a passage does.</li>
            </ul>

            <h3>What Loom will not do</h3>
            <p>Nothing here is generated for you. No model reads your work, ranks it, scores it or suggests what to write — the tool counts what you made and shows you the count. An empty state is a fact about where you have got to, not a fault to fix. And your work leaves as files wherever you made it: the cloth at 01, its threads at 02, a projection and your Capture Log at 03, your vocabulary at 04.</p>
            <p className="info-note">Loom is the middle step, not the deliverable. It gets you to a concept map you draw by hand, and to the talk you build from that.</p>

            <h3>The thinking behind it</h3>
            <ul>
              <li><b>Object Worlds (Bucciarelli):</b> each discipline inhabits its own world, with its own instruments and language. An engineer might name a connection &ldquo;is the bottleneck for&rdquo; where a humanist says it &ldquo;betrays&rdquo; the text. Loom keeps those differences visible instead of flattening them.</li>
              <li><b>Communities of Practice (Wenger):</b> a shared vocabulary is learned by doing the work alongside other people, not by being handed a glossary. A class grows its own link labels over a term.</li>
              <li><b>Boundary Objects (Star):</b> people from distinct fields coordinate around one shared object without agreeing on what it means. A cloth is meant to be exactly that — locally useful, and robust enough to hold across groups.</li>
              <li><b>Concept maps (Novak &amp; Gowin):</b> arranging cards by hand is the thinking. The board digitises the sorting; the map you draw afterwards is where it lands.</li>
            </ul>

          </div>
        </div>
      )}
    </>
  )
}
