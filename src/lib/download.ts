"use client"

/** Hand the student a file — used by 03 · Knowledge Graph's per-projection download and by ObjectDownload at each object. */
export function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
