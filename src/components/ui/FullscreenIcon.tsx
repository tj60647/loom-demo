/**
 * The full-screen glyph: four corner brackets, outward to enter and inward to
 * leave. Drawn rather than typed (TJ, 2026-08-17).
 *
 * It WAS a character — `⛶` U+26F6 SQUARE FOUR CORNERS, which is genuinely the
 * standard icon and does render correctly on this machine. The problem is that
 * it is a gamble somewhere else: U+26F6 sits in Miscellaneous Symbols, where
 * font coverage varies by platform, and its neighbour U+26F7 comes back as a
 * full-colour skier emoji from the same stack. A control's icon should not
 * depend on which font a reader's machine reaches for.
 *
 * The exit state was worse than a gamble: it was `↙`, a plain diagonal arrow,
 * which says "go down-left" rather than "come back in". Corners pointing
 * inward is the convention every player and icon set uses, and now the two
 * states are the same drawing reversed, which is what makes a pair read as a
 * pair.
 *
 * `currentColor` and no fill, so it inherits the button's ink — including the
 * hover state — the way the wordmark's own SVG does. 1em-relative sizing keeps
 * it in step with the label beside it instead of pinning it to a pixel size
 * that only suits today's 11px buttons.
 */
export default function FullscreenIcon({ exit = false }: { exit?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.3em"
      height="1.3em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      // Decorative: every caller carries the words "full screen" in its label,
      // so announcing this would say the same thing twice.
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: "-0.25em", flex: "none" }}
    >
      {exit ? (
        // Four arrows pointing IN — tails at the corners, heads toward the
        // middle.
        <>
          <path d="M4 4l5 5" /><path d="M9 4v5H4" />
          <path d="M20 4l-5 5" /><path d="M15 4v5h5" />
          <path d="M20 20l-5-5" /><path d="M15 20v-5h5" />
          <path d="M4 20l5-5" /><path d="M9 20v-5H4" />
        </>
      ) : (
        // Four arrows pointing OUT — heads at the corners, tails toward the
        // middle.
        <>
          <path d="M9 9L4 4" /><path d="M9 4H4v5" />
          <path d="M15 9l5-5" /><path d="M15 4h5v5" />
          <path d="M15 15l5 5" /><path d="M15 20h5v-5" />
          <path d="M9 15l-5 5" /><path d="M9 20H4v-5" />
        </>
      )}
    </svg>
  )
}
