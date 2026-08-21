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

  const course = encodeURIComponent(viewing.courseId)
  const teaching = [
    { label: "Courses", href: `/admin/courses?course=${course}` },
    { label: "Readings", href: `/admin/library?course=${course}` },
    { label: "Roster", href: `/admin?course=${course}` },
    { label: "Cohort Graph", href: `/admin/aggregate?course=${course}` },
    { label: "Workflows", href: `/workflows?course=${course}` },
    { label: "Access", href: `/access?course=${course}` },
  ]

  return (
    <aside aria-label="Teaching — you are viewing a student's loom" className="card teachfloat">
      {/* Whose loom this is, as the header — the one fact that must never be
          ambiguous inside the mode. */}
      <span className="whose cap" style={{ textTransform: "none" }}>
        read only — <b>{viewing.name ?? viewing.email}</b>&apos;s loom
      </span>
      {/* Rows with a hover wash, not underlined links (TJ, 2026-08-20). Plain
          anchors on purpose: leaving a student's loom for a Teaching page is a
          full navigation, and the providers must remount to stop reading the
          student (same rule as the enter/exit routes). */}
      <nav>
        {teaching.map((item) => (
          <a key={item.label} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <a href="/api/view-user/exit" className="btn ghost mini compact">
        Exit — back to Roster
      </a>
    </aside>
  )
}
