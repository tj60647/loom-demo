"use client"

/**
 * Take the roster you are looking at.
 *
 * TJ, 2026-08-24: "we need a 'download email list' on the roster. we should be
 * able to filter by role and section."
 *
 * IT EXPORTS WHAT IS ON SCREEN, not the whole course. The tabs, the section
 * picker, the role filter and "no response yet" have already narrowed the
 * rows; this hands over that set. Same rule as 03's downloads (TJ,
 * 2026-08-23: "download options for the knowledge graph should depend on
 * view") and the same reason: a download that ignores the filters above it is
 * a second, invisible query the reader has to know about.
 *
 * The scope is named in the filename rather than only in the button, so a file
 * on disk still says which slice it was — `design_frameworks-invited_no_response`
 * rather than a roster that could be anybody's.
 *
 * NO WORK LEAVES WITH IT. Addresses, names, status, section and role: what the
 * roster already shows. A student's concepts, passages and cloths are theirs
 * and have their own exports, on their own objects.
 */

import { downloadText } from "@/lib/download"
import { emailList, rosterCsv, rosterFilename, type RosterExportRow } from "@/lib/rosterExport"

export default function RosterDownload({
  people,
  courseName,
  scope,
}: {
  people: RosterExportRow[]
  courseName: string | null | undefined
  /** What the filters have narrowed to, for the filename: "enrolled",
   *  "invited_no_response", "enrolled_faculty_section_1"… */
  scope: string
}) {
  if (people.length === 0) return null

  const take = (ext: "txt" | "csv") => {
    const body = ext === "txt" ? emailList(people) : rosterCsv(people)
    downloadText(
      body,
      rosterFilename(courseName, scope, ext),
      // charset on both: a roster carries names with accents and CJK, and a
      // bare text/csv is read as the reader's locale encoding by some tools.
      ext === "txt" ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8"
    )
  }

  return (
    <div className="rosterdl">
      {/* The count is in the label because it is the whole assurance that the
          filters were honoured — 33 on screen, 33 in the file. */}
      <button
        className="btn mini ghost"
        onClick={() => take("txt")}
        data-tip="the addresses on screen, comma-separated, ready to paste into a To: field"
      >
        download {people.length} email{people.length === 1 ? "" : "s"}
      </button>
      <button
        className="btn mini ghost"
        onClick={() => take("csv")}
        data-tip="the same people as a table — email, name, status, section, role"
      >
        download .csv
      </button>
    </div>
  )
}
