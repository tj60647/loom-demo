// Legacy Keep now redirects to Files, where maps and the whole weave export.

import { redirect } from "next/navigation"

export default function Page() {
  redirect("/files")
}
