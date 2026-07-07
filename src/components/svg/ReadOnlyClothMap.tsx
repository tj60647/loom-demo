"use client"

import { useState } from "react"
import ClothMap from "@/components/svg/ClothMap"
import type { LoomState } from "@/lib/types"

type ReadSel =
  | { type: "concept" | "edge" | "hub"; id?: string; ids?: string[]; promptIdx?: number }
  | null

export default function ReadOnlyClothMap({ state }: { state: LoomState }) {
  const [readSel, setReadSel] = useState<ReadSel>(null)
  return <ClothMap state={state} readSel={readSel} setReadSel={setReadSel} />
}
