/**
 * A house — the way out of a reading, to the one page that carries the app's
 * own chrome.
 *
 * THE REASON IS WAYFINDING, NOT NAVIGATION (TJ, 2026-08-19: "someone looking at
 * the journey bar in reading would have no idea how to get to a place where
 * they could see about. thus the home logo").
 *
 * 01 Reading stands the header down — the save light moved into the journey bar
 * on 2026-08-17 precisely so it could. That header is where Loom's name, the
 * menu, My Loom and **About** live, so inside a reading there is no visible
 * route to any of them. `00 Library` is in the bar, but it reads as a station
 * among stations: one more place in the journey, not the way back out of it.
 *
 * So the house is doing the job no station link can. It does not promise "the
 * Library" — the label and the tip say that. It promises "out, to where the
 * app is", which is what a reader who wants About is actually looking for.
 *
 * A shelf icon was tried and reverted the same hour: it named the destination
 * accurately and lost the entire point, because the destination was never what
 * this control is for.
 *
 * Drawn here rather than pulled in as a font, the same as GuideIcon and
 * FullscreenIcon, so the whole set answers to one stroke weight.
 *
 * All stroke, no fill, and the door left open at the baseline: at this size a
 * filled roof closes the shape into a pentagon and stops reading as a house,
 * which is the same crowding GuideIcon's note records for its needle. The
 * roofline runs past the walls on both sides because eaves are most of what
 * makes a house legible at 20px.
 */
export default function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.5em"
      height="1.5em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: "-0.3em", flex: "none" }}
    >
      {/* Roof first, eaves proud of the walls. */}
      <path d="M3.2 10.6L12 3.8l8.8 6.8" />
      {/* Walls, stopping at the baseline rather than closing under the door. */}
      <path d="M5.4 9.4V20h13.2V9.4" />
      {/* The door, open at the foot so the shape has a way in. */}
      <path d="M9.9 20v-5.3h4.2V20" />
    </svg>
  )
}
