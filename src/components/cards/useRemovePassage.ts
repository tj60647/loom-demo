"use client"

import { useCallback } from "react"
import { useDialog } from "@/components/providers/DialogProvider"
import { useLoom } from "@/components/providers/LoomProvider"
import { short } from "@/lib/clothMath"
import type { Passage } from "@/lib/types"

/**
 * DELETING A CAPTURE, ASKED ONCE AND WORDED ONCE.
 *
 * Two surfaces offer this act — Your work's passage card and the margin rail
 * card (2026-08-18) — and a destructive act described two ways drifts into two
 * different promises about what it takes with it. `ConceptNamingAssist` is the
 * repo's recorded case of exactly that, so the dialog lives here rather than at
 * either call site.
 *
 * It asks, which Your work did NOT until now: `removePassage` was wired
 * straight to the button, so one mis-click destroyed a capture with no way
 * back. `removePassage` is optimistic in LoomProvider — the row clears before
 * the server answers — so there was nothing to catch it either. The delete
 * itself is real: actions/loom.ts `deletePassage` drops the row and the
 * passageConcepts join cascades with it.
 *
 * The CONCEPTS survive, and the copy says so, because that is the thing a
 * student cannot infer: a Concept belongs to the User and travels through every
 * text they have read, so nothing about deleting one capture should touch it.
 * Only the pointer goes.
 */
export function useRemovePassage() {
  const { confirm } = useDialog()
  const { removePassage } = useLoom()

  return useCallback(
    async (passage: Passage) => {
      const quoted = short(passage.content.trim(), 80)
      const ok = await confirm({
        // The quotation, because the margin rail draws several cards at once
        // and they are terse — "this passage" names nothing you can see from
        // a dialog covering the page.
        title: `Delete “${quoted}”?`,
        body:
          passage.note
            ? "The words you kept and your note on them both go, with every concept this passage was filed under. The concepts themselves stay in your vocabulary — a concept belongs to you, not to one capture."
            : "The words you kept go, with every concept this passage was filed under. The concepts themselves stay in your vocabulary — a concept belongs to you, not to one capture.",
        confirmLabel: "Delete passage",
        danger: true,
      })
      if (ok) await removePassage(passage.id)
    },
    [confirm, removePassage]
  )
}
