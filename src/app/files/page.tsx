import type { Metadata } from "next"
import KeepPage from "@/components/shelf/KeepPage"

export const metadata: Metadata = { title: "Export & backup" }

export default function FilesPage() {
  return <KeepPage />
}
