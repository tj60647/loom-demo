/**
 * The mark, drawn wherever Loom names itself.
 *
 * Extracted from Header so the journey bar can carry it in reading focus,
 * where the header stands down (Workbench sets `data-reading-focus`).
 *
 * The red weft through the mark is the environment tell — the same clue as the
 * favicon and the dev OAuth app's logo. It is driven by `data-env` on <body>
 * (set once in layout.tsx) rather than by a prop, because the two places that
 * draw this mark sit in different trees and only one of them is close enough
 * to the server to know which deployment this is. Threading `deployEnv` down
 * through the reading page AND the sandbox to reach the journey bar would put
 * the same fact in two prop chains, and the day one of them was missed the
 * mark would quietly claim to be production.
 *
 * Fail-safe direction: the weft shows unless <body> says "production", so an
 * environment that never set the attribute wears the dev thread rather than
 * passing itself off as the real site.
 */
export default function LoomMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`loommark${className ? ` ${className}` : ""}`}
      width="17"
      height="12"
      viewBox="0 0 26 18"
      fill="none"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 15 L7 4 L12 15 L17 4 L22 15" stroke="#a8843f" />
      <path className="weft" d="M1 9.5 L23 9.5" stroke="#b23a2b" strokeWidth="1.6" />
    </svg>
  )
}
