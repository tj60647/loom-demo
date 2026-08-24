import { fileStamp } from "@/lib/objectExport"

/**
 * The roster, taken away as a list of addresses.
 *
 * TJ, 2026-08-24: "we need a 'download email list' on the roster. we should be
 * able to filter by role and section." The occasion was a student who could
 * not sign in and a roster of 64 invitations with no way to mail a subset of
 * them without reading addresses off the screen one at a time.
 *
 * THE DOWNLOAD FOLLOWS THE VIEW, which is the rule TJ set for 03's downloads
 * on 2026-08-23 ("download options for the knowledge graph should depend on
 * view"). Whatever the tabs, the section picker and the role filter have
 * narrowed to is exactly what leaves in the file — so the count on screen and
 * the count in the file agree, and there is no second set of controls to keep
 * in step with the first.
 *
 * Two shapes, because they are two errands. `.txt` is addresses and nothing
 * else, comma-separated, which is what a To: field takes. `.csv` is the same
 * people with the columns that say who they are, which is what a record wants.
 * Neither carries a student's work: this is a contact list, not an export of
 * anybody's loom.
 */

export type RosterExportRow = {
  email: string
  name: string | null
  status: string
  sectionName: string | null
  role: string
}

/**
 * Addresses alone, comma-space separated.
 *
 * Comma-space rather than newlines: every mail client accepts it in a To:
 * field, and a newline-separated list pasted into one silently becomes a
 * single malformed recipient in some of them. A trailing newline so the file
 * ends the way a text file should.
 */
export function emailList(rows: RosterExportRow[]): string {
  const seen = new Set<string>()
  const addresses: string[] = []
  for (const row of rows) {
    const email = (row.email ?? "").trim()
    if (!email) continue
    // One address once, however many rows carry it. DEFENSIVE rather than
    // required: `getRoster` skips the pending row for an address that is
    // already enrolled (src/actions/admin.ts:296), and course_allowed_email
    // is unique per (courseId, email), so today nothing upstream can hand
    // this the same address twice. It costs a Set to stay true if that ever
    // changes, and mailing somebody twice is what a list like this gets
    // blamed for.
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    addresses.push(email)
  }
  return addresses.join(", ") + "\n"
}

/**
 * One field of a CSV, quoted only where it has to be.
 *
 * A name is free text a person typed — "Zhang, Cheng" and a stray quote are
 * both ordinary — and either one unquoted moves every later column by one.
 */
function csvField(value: string): string {
  const text = value ?? ""
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The same people as a table: who they are, not what they have made. */
export function rosterCsv(rows: RosterExportRow[]): string {
  const header = ["email", "name", "status", "section", "role"]
  const lines = [header.join(",")]
  for (const row of rows) {
    lines.push(
      [
        csvField(row.email ?? ""),
        csvField(row.name ?? ""),
        csvField(row.status ?? ""),
        csvField(row.sectionName ?? ""),
        // A pending invitation has no role yet — it gets one when the person
        // first signs in. Empty rather than a guess at "learner".
        csvField(row.status === "pending" ? "" : row.role ?? ""),
      ].join(",")
    )
  }
  // CRLF: the line ending RFC 4180 specifies, and the one Excel opens without
  // asking questions about the file.
  return lines.join("\r\n") + "\r\n"
}

/**
 * `<course>-<scope>.roster.<stamp>.<ext>`, the same shape every other object
 * leaving Loom wears (objectExport.objectExportFilename): whose, what, stamped
 * last so a folder sorts like files together.
 */
export function rosterFilename(
  courseName: string | null | undefined,
  scope: string,
  ext: string,
  at?: Date
): string {
  const slug = (text: string) =>
    text.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toLowerCase()
  const who = slug(courseName || "course") || "course"
  const what = slug(scope) || "all"
  return `${who}-${what}.roster.${fileStamp(at)}.${ext}`
}
