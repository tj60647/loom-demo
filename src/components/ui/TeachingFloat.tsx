import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { resolveViewTarget } from "@/lib/viewUserServer"

/**
 * The floating Teaching menu — the one staff control left standing inside
 * Open Loom (TJ, 2026-08-20: "maybe its a floating menu?").
 *
 * Inside a student's loom the journey bar belongs to the student's journey
 * and getActiveCourse masks the staff flags, so the header's Teaching group
 * goes quiet with everything else. This float is what remains: it names
 * whose loom the viewer is inside — the fact that must never be ambiguous —
 * carries the six Teaching doors, and holds the way out. A server
 * component: it renders nothing unless resolveViewTarget authorizes, so its
 * presence IS the mode, and a forged cookie draws no float.
 */
export default async function TeachingFloat() {
  const session = await getServerSession(authOptions)
  const viewing = await resolveViewTarget(session?.user?.id)
  if (!viewing) return null

  return (
    <aside aria-label="You are viewing a student's loom" className="card teachfloat">
      {/* Whose loom this is, as the header — the one fact that must never be
          ambiguous inside the mode. Just the name and the way out (TJ,
          2026-08-21): the Teaching links it carried for a day went — Exit
          lands on the Roster, where the Teaching nav already lives. */}
      <span className="whose cap" style={{ textTransform: "none" }}>
        read only — <b>{viewing.name ?? viewing.email}</b>&apos;s loom
      </span>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {/* A plain anchor to a resolver-gated route: the download exists
            only inside the mode, and the server re-checks on the request. */}
        <a href="/api/view-user/export" className="btn ghost mini compact">
          Download loom
        </a>
        <a href="/api/view-user/exit" className="btn ghost mini compact">
          Exit
        </a>
      </div>
    </aside>
  )
}
