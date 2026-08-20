import type { Metadata } from "next"
import Shelf from "@/components/shelf/Shelf"

export const metadata: Metadata = { title: "Library" }

export default function LibraryPage() {
  return <Shelf />
}
