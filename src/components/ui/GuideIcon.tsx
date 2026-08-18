/**
 * The guide: a navigation arrow in a ring — Material Symbols'
 * `assistant_navigation`, drawn here rather than pulled in as a font (TJ,
 * 2026-08-17).
 *
 * It reads as "something that will steer you", which is what the practice
 * loom does: it walks a student through every move on a real reading. A
 * question mark would have said "help", which is a manual you go and read,
 * and a lifebuoy would have said "you are in trouble". Neither is this.
 *
 * The needle is FILLED and the ring is stroked, so at 13px the arrow is what
 * the eye lands on. An all-stroke needle closes up into a blob at this size —
 * the same crowding that made the first attempt at the full-screen exit icon
 * read as a plus sign.
 */
export default function GuideIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.95em"
      height="1.95em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: "-0.25em", flex: "none" }}
    >
      <circle cx="12" cy="12" r="9" />
      {/* The navigation cursor: apex north, notched tail, so it reads as a
          needle pointing somewhere rather than as a plain triangle. */}
      <path d="M12 6.6l4 10.2-4-2.4-4 2.4z" fill="currentColor" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}
