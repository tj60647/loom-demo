import type { Concept } from "@/lib/types"
import { conceptName } from "@/lib/conceptName"

/**
 * A Concept's name as DOM, with the placeholder styled when there is no Label.
 *
 * A component rather than 25 copies of the same ternary, and it deliberately
 * emits a bare fragment in the ordinary case: the existing Playwright locators
 * match on text content (`.lconcept`, `.pchip`, `.lrow` by `hasText`), so a
 * labelled Concept must not gain a wrapper element that changes what those
 * selectors see.
 *
 * SVG sites cannot use this — `<span>` is not a thing inside `<text>`, and
 * `color` does nothing there. MapTab and ClothMap call `conceptName` directly
 * and set `fill`.
 */
export default function ConceptName({ concept }: { concept: Pick<Concept, "label"> }) {
  const { text, unlabeled } = conceptName(concept)
  return unlabeled ? <span className="unlabeled">{text}</span> : <>{text}</>
}
