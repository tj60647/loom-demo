import type { Concept } from "@/lib/types"

/**
 * WHAT A CONCEPT WITH NO LABEL IS CALLED ON SCREEN.
 *
 * A Concept may carry a Description and no Label (TJ, 2026-08-18: "a concept
 * needs either or both a description and a label"), and the model has allowed
 * it for longer — docs/loom-model-build.md §2 Concept defines the Label as
 * "[< 8 words, may be null at capture]" and adds that "A Label need not
 * exist before linking; naming can follow."
 *
 * Until this module every surface but the margin rail interpolated `label`
 * raw, so a described-but-unnamed Concept appeared as a blank row in 04 ·
 * Vocabulary, an empty pill in Your work, a nameless node on the board, and
 * `- **** — description` in a vocabulary export. Its own delete dialog read
 * `Delete “”?`, and its merge picker announced `Merge “” into`.
 *
 * The margin rail already coped, differently: `railConceptName` substituted
 * the Description. That is gone — TJ chose one rule everywhere (2026-08-18)
 * over a rail that names concepts by their gloss while every other surface
 * names them by a placeholder.
 */
export const UNLABELED_CONCEPT = "(unlabeled concept)"

type Named = Pick<Concept, "label">

/**
 * DISPLAY ONLY, and the `unlabeled` flag is why this returns an object rather
 * than a string: the caller has to be able to style the placeholder without
 * string-matching it back out.
 *
 * NEVER use `text` as a VALUE. Not an `<option value>`, not a `<datalist>`
 * entry, not a URL parameter, not an export field, not a match or sort key.
 * Those stay raw. A placeholder in a value coins a Concept literally named
 * "(unlabeled concept)" the first time somebody picks it from a list —
 * cards/AddConceptCard.tsx already filters blanks out of its datalist for the
 * neighbouring reason, and its comment records the bug that taught us.
 */
export function conceptName(concept: Named): { text: string; unlabeled: boolean } {
  const text = concept.label.trim()
  return text ? { text, unlabeled: false } : { text: UNLABELED_CONCEPT, unlabeled: true }
}

/**
 * The same rule where only a string will do — an `aria-label`, a `title`, or
 * the prose of a confirm dialog. Still display; still never a value.
 */
export const conceptNameText = (concept: Named): string => conceptName(concept).text
