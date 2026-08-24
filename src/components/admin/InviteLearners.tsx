"use client"

// Invite a roster in one paste, and say what happened to each address.
//
// A silent bulk import is the worst kind: a typo'd address just never gets in,
// and nobody finds out until the student says they cannot sign in.

import { useActionState } from "react"
import { inviteLearners, type InviteResult } from "@/actions/admin"

type Section = { id: string; name: string }

export default function InviteLearners({
  courseId,
  sections,
}: {
  courseId: string
  sections: Section[]
}) {
  const [result, action, pending] = useActionState<InviteResult, FormData>(inviteLearners, null)

  return (
    <form action={action} style={{ display: "grid", gap: "10px" }}>
      <input type="hidden" name="courseId" value={courseId} />

      <div className="form-row">
        <span className="label">
          Emails — one per line
          {sections.length > 0 ? (
            <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--grey)" }}>
              {" "}(add <code>, Section name</code> after an address to place it)
            </span>
          ) : null}
        </span>
        <textarea
          name="emails"
          rows={6}
          required
          placeholder={
            sections.length > 0
              ? `ada@example.edu\ngrace@example.edu, ${sections[0].name}`
              : "ada@example.edu\ngrace@example.edu"
          }
          style={{ fontFamily: "var(--mono)", fontSize: "13px" }}
        />
      </div>

      <div className="quietrow" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        {sections.length > 0 ? (
          <>
            <span className="label" style={{ flex: "0 0 auto" }}>Section for the rest</span>
            <select name="sectionId" className="tinput inline" aria-label="Default section">
              <option value="">No section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          </>
        ) : null}
        <button
          className="btn mini nowrapbtn"
          type="submit"
          disabled={pending}
          data-tip="add these addresses to the roster — each may then sign in with the GitHub account that has confirmed it"
        >
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>

      {result && (
        <div className="invitereport" role="status">
          {result.added.length > 0 && (
            <p>
              <b>{result.added.length} invited.</b> They join the course the first time they
              sign in with that GitHub email.
            </p>
          )}
          {result.already.length > 0 && (
            <p className="hint">
              {result.already.length} already on the roster — section updated where you named one.
            </p>
          )}
          {result.unknownSections.length > 0 && (
            <p className="hint" style={{ color: "var(--red)" }}>
              No section called {result.unknownSections.map((s) => `“${s}”`).join(", ")} — those
              addresses took the section chosen above instead.
            </p>
          )}
          {result.invalid.length > 0 && (
            <>
              <p className="hint" style={{ color: "var(--red)" }}>
                {result.invalid.length} line{result.invalid.length !== 1 ? "s" : ""} did not read as
                an email address and {result.invalid.length !== 1 ? "were" : "was"} skipped:
              </p>
              <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                {result.invalid.slice(0, 8).map((line, i) => (
                  <li key={i} className="hint" style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>
                    {line}
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.added.length === 0 &&
            result.already.length === 0 &&
            result.invalid.length === 0 && <p className="hint">Nothing to invite.</p>}
        </div>
      )}
    </form>
  )
}
