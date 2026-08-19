"use client"

import { useCallback } from "react"
import { useDialog } from "@/components/providers/DialogProvider"
import { useLoom } from "@/components/providers/LoomProvider"

/**
 * COINING A CONCEPT AHEAD OF ITS EVIDENCE, warned once and worded once.
 *
 * Three surfaces offer it from 2026-08-18 — Your work, the warp and 04 ·
 * Vocabulary — so the homonym warning lives here rather than in each, the same
 * argument as `useRenameConcept` and `useRemovePassage`.
 *
 * Warned, never forbidden (ruling 36): distinct Concepts may share a Label. The
 * dialog says what the student gets if they go on, and names the repair that
 * EXISTS — merge is hidden while TJ resolves what it means.
 *
 * The trim happens ONCE, at the top, and the comparison uses the trimmed value.
 * This used to match untrimmed and write trimmed, so "boundary objects " missed
 * the homonym check entirely and minted a second concept with a
 * passage-identical stored label — silently, at the exact gesture designed to
 * ask. A trailing space is what a paste leaves, and what a tapped suggestion
 * can leave. It also stops " " reaching `addConcept`, which does not validate.
 */
export function useCoinConcept() {
  const { confirm } = useDialog()
  const { state, addConcept, flash } = useLoom()

  return useCallback(
    async (rawLabel: string, def?: string) => {
      const name = rawLabel.trim()
      if (!name) return
      const existing = state.concepts.find((c) => c.label.toLowerCase() === name.toLowerCase())
      if (existing) {
        const ok = await confirm({
          title: `You already have a concept named “${existing.label}”.`,
          body: "Make a second, distinct concept with the same name? They stay separate (homonyms) — if they turn out to be one idea, file the passages under the one you keep and remove the other.",
          confirmLabel: "Make a homonym",
        })
        if (!ok) return
      }
      // The gloss travels with the naming: it is the reason you expect to find
      // this, and it is what you will read the candidate passage against.
      await addConcept(name, def || undefined)
      flash("named — it shows as no evidence until a passage backs it")
    },
    [confirm, state.concepts, addConcept, flash]
  )
}
