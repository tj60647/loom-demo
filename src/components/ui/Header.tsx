"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import AuthButton from "./AuthButton"
import AboutModal from "./AboutModal"
import LoomMark from "./LoomMark"
import MyLoomModal from "./MyLoomModal"
import { useFullscreen } from "./useFullscreen"

export default function Header({ deployEnv, isBranchPreview = false }: { deployEnv?: string; isBranchPreview?: boolean }) {
  const { data: session } = useSession()
  const { flashMsg } = useLoom()
  // Masked by the student lens, which is what makes the workflows link below
  // come back for a staff member viewing as a student.
  const { course } = useReadings()
  const [showAbout, setShowAbout] = useState(false)
  const [showMyLoom, setShowMyLoom] = useState(false)
  // Nothing on an admin page writes to a loom, so the save dot sat there as a
  // bare em dash for the whole visit and read as a stray character.
  const pathname = usePathname()
  const inAdmin = pathname?.startsWith("/admin") ?? false
  // The practice loom. My Loom still opens here — the Header sits ABOVE
  // SandboxLoomProvider in the tree (layout.tsx wraps it in the real
  // LoomProvider), so the counts shown are the student's actual work and are
  // correct. Start over is what gets suppressed: offering to clear a real loom
  // from the page that promises nothing is kept is a confusion worth avoiding
  // even though the call would do exactly what it says.
  const inSandbox = pathname?.startsWith("/sandbox") ?? false

  // See useFullscreen for why this is read from the document rather than from
  // what we last asked for, and why it earns a slot in the chrome at all. The
  // reading-focus menu offers the same control from the journey bar.
  const { isFull, canFull, toggleFull } = useFullscreen()
  // Anywhere that isn't the real site says so in the tagline. The matching red
  // weft through the mark is LoomMark's, driven by `data-env` on <body>.
  const isDev = deployEnv !== "production"

  return (
    <>
      <header>
        <div className="wordmark">
          <LoomMark />
          <div>
            Loom
            <small>
              lay the warp · throw the weft
              {isDev && <span style={{ color: "var(--red)" }}> · dev</span>}
            </small>
          </div>
        </div>
        <div className="spacer"></div>
        {session && !inAdmin && (
          <span id="saveDot">{flashMsg ? `· ${flashMsg} ·` : "—"}</span>
        )}
        <AuthButton isBranchPreview={isBranchPreview} />
        <button
          className="btn ghost mini"
          onClick={() => setShowAbout(true)}
          data-tip="what Loom is, and the thinking behind it"
        >
          about
        </button>
        {/* Between about and workflows (TJ, 2026-08-13). The slot is the
            argument: a whole-loom surface had nowhere to live once Keep was
            deleted, and a station is the thing that was deleted — so this is
            chrome, like About beside it. Session-gated because an empty loom
            is a fact about a student, and there is no student here without
            one. See MyLoomModal for why it is a mirror and never a workshop. */}
        {session && (
          <button
            className="btn ghost mini"
            onClick={() => setShowMyLoom(true)}
            data-tip="what you have made, and how to start over"
          >
            my loom
          </button>
        )}
        {/* Beside About (TJ, 2026-08-08), and reachable from every page — it is
            not an admin surface: a student reads their own flow there.
            Since 2026-08-09 it also sits right of Courses in the journey bar's
            staff group (TJ), so it is drawn HERE only for those who have no
            staff group to carry it — otherwise the header and the bar would
            both offer the same link, which is what the Administration and
            Cohort Map buttons were removed for. A staff member wearing the
            student lens has `isStaff` masked to false and so gets it back
            here, which is exactly what a student sees. */}
        {session && !course?.isStaff && (
          <Link
            href="/workflows"
            className="btn ghost mini"
            data-tip="how you move through Loom, step by step"
          >
            workflows
          </Link>
        )}
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
            className="btn ghost mini"
            data-tip="the guide — walk every move on a real reading, nothing is kept"
          >
            guide
          </Link>
        )}
        {/* Beside the guide, per TJ. Hidden where the browser will not grant
            it (an iframe without allowfullscreen, a locked-down kiosk) rather
            than offered and dead. */}
        {session && canFull && (
          <button
            className="btn ghost mini"
            onClick={toggleFull}
            aria-pressed={isFull}
            data-tip={isFull ? "back to the browser (esc)" : "give Loom the whole screen"}
          >
            {isFull ? "exit full screen" : "full screen"}
          </button>
        )}
      </header>

      {showMyLoom && (
        <MyLoomModal onClose={() => setShowMyLoom(false)} allowReset={!inSandbox} />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  )
}
