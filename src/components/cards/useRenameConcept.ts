"use client"

import { useCallback } from "react"
import { useDialog } from "@/components/providers/DialogProvider"
import { useLoom } from "@/components/providers/LoomProvider"
import type { Concept } from "@/lib/types"

/**
 * RENAMING A CONCEPT, ASKED ONCE AND WORDED ONCE.
 *
 * Two surfaces offer it — Your work's concept card and, since 2026-08-18,
 * 04 · Vocabulary's — and a homonym warning phrased two ways would become two
 * different accounts of what sharing a name costs. The same argument as
 * `useRemovePassage`, and the same remedy.
 *
 * It takes the INPUT, not a string, because a declined confirm has to put the
 * old label back into an uncontrolled field: the card renders it with
 * `defaultValue` and a `key` on the label, so nothing else can undo the typing.
 *
 * Warned, never forbidden (ruling 36): homonyms are legal. The second sentence
 * offers the repair that EXISTS — merge is hidden while TJ resolves what it
 * means (VocabularyTab's MERGE_VISIBLE), and a dialog is a bad place to learn
 * that the way out it named is not there.
 */
export function useRenameConcept() {
  const { confirm } = useDialog()
  const { state, editConcept, flash } = useLoom()

  return useCallback(
    async (concept: Concept, input: HTMLInputElement) => {
      const v = input.value.trim()
      if (!v || v === concept.label) return
      const clash = state.concepts.find(
        (c) => c.id !== concept.id && c.label.toLowerCase() === v.toLowerCase()
      )
      if (clash) {
        const ok = await confirm({
          title: `You already have a concept named “${v}”.`,
          body: "Rename anyway? The two stay distinct concepts sharing a name — if they are one idea, file this one's passages under the other and remove it.",
          confirmLabel: "Rename anyway",
        })
        if (!ok) {
          input.value = concept.label
          return
        }
      }
      editConcept(concept.id, { label: v })
      flash("renamed")
    },
    [confirm, state.concepts, editConcept, flash]
  )
}
