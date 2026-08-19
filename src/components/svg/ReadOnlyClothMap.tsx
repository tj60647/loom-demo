"use client"

// One student's cloth, on /admin/user/[id] — and READ-ONLY has been literally
// true since 2026-08-18 (TJ: "all cloths hide/disable trace").
//
// This file held a `useState` whose only job was to feed ClothMap a selection,
// so the "read-only wrapper" was in fact the one surface where a stranger's
// cloth could be traced. With SHOW_TRACE off in ClothMap the selection could
// never light anything, and a piece of state that cannot be seen is a thing to
// delete rather than to leave lying. There is no panel here that reads a
// selection out, so nothing else wanted it.
//
// The wrapper stays: ClothMap requires `readSel`/`setReadSel`, and a caller
// that wants only a drawing should not have to say so twice.

import ClothMap, { type ClothGlow } from "@/components/svg/ClothMap"
import type { LoomState } from "@/lib/types"

export default function ReadOnlyClothMap({ state, glow = null }: { state: LoomState; glow?: ClothGlow }) {
  return <ClothMap state={state} readSel={null} setReadSel={() => {}} glow={glow} />
}
