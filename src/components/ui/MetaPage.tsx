import Link from "next/link"
import JourneyNav from "@/components/ui/JourneyNav"

/**
 * The frame for a reference page — Workflows, Access.
 *
 * These pages used to be a bare `<main>`, so reaching one from the journey bar
 * made the bar itself disappear: the whole frame was replaced rather than the
 * work inside it (TJ, 2026-08-09: "the workflows tab should behave like the
 * others, change what is below, not replacing the frame"). Now they wear the
 * same scopebar / journey / footer as the Library and Keep, and only the middle
 * changes.
 *
 * No station is `active`: these are not steps on the student's arc. The bar is
 * there so you can leave, and so that where you are stays legible.
 */
export default function MetaPage({
  title,
  meta,
  foot,
  children,
}: {
  title: string
  /** The one line under the title, in the scopebar. */
  meta: string
  /** The right-hand footer line. The left is the title, upper-cased. */
  foot: string
  children: React.ReactNode
}) {
  return (
    <>
      <div className="scopebar">
        <Link href="/" className="scopeback">‹ library</Link>
        {/* A real <h1>, not a styled span: this is the page's heading, and a
            reference page with no heading has no document structure for a
            screen reader (or for tests) to hold on to. `.scopetitle` carries
            the look, and the base rule already zeroes h1's margin, so it sits
            exactly where the span did. */}
        <h1 className="scopetitle">{title}</h1>
        <span className="scopemeta">{meta}</span>
      </div>
      <JourneyNav active={null} />
      <main>{children}</main>
      <footer>
        <span className="fl">{title.toUpperCase()}</span>
        <span className="fr">{foot}</span>
      </footer>
    </>
  )
}
