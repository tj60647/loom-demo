"use client"

import { CAPABILITIES, MATRIX_NOTES, type Access, type CapabilityGroup } from "@/lib/capabilities"

/**
 * Who can do what, rendered from src/lib/capabilities.ts.
 *
 * Beside the flows because it answers the question they raise: the diagrams
 * show how each person MOVES, and this shows what each person may REACH.
 *
 * Every row names the server gate that refuses — not the UI that hides the
 * button — and `npm run check` asserts those gates still exist, so a rename
 * fails the build instead of leaving a confident, wrong table on screen.
 */

const MARK: Record<Access["verdict"], string> = {
  yes: "●",
  qualified: "◐",
  // A dash, not a dot. "No" is the answer this table exists to give clearly,
  // and a faint dot is indistinguishable from a cell that failed to render.
  no: "—",
}

const WORD: Record<Access["verdict"], string> = {
  yes: "yes",
  qualified: "qualified",
  no: "no",
}

function Cell({ access, role }: { access: Access; role: string }) {
  return (
    <td className={`mcell m-${access.verdict}`}>
      {/* The glyph is for scanning; the words are for anyone who cannot scan
          it. A screen reader gets "Faculty: qualified — their own courses"
          rather than a bullet. */}
      <span aria-hidden="true">{MARK[access.verdict]}</span>
      <span className="visually-hidden">{`${role}: ${WORD[access.verdict]}${access.note ? ` — ${access.note}` : ""}`}</span>
      {access.note && <span className="mnote">{access.note}</span>}
    </td>
  )
}

export default function RoleMatrix() {
  const groups = [...new Set(CAPABILITIES.map((c) => c.group))] as CapabilityGroup[]

  return (
    <section className="matrix">
      <h2>Who can reach what</h2>
      <p className="hint">
        Read off the code that enforces it, not the buttons that are drawn.
        <b> ●</b> yes · <b>◐</b> yes, with the limit named · <b>—</b> no.
        A student is not a stored role — it is an active course membership that
        is not faculty, held by someone who is not a site admin.
      </p>

      <div className="scrollx">
        <table className="mtable">
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">Student</th>
              <th scope="col">Faculty</th>
              <th scope="col">Admin</th>
              <th scope="col">Enforced by</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group}>
              <tr className="mgroup">
                <th scope="colgroup" colSpan={5}>{group}</th>
              </tr>
              {CAPABILITIES.filter((c) => c.group === group).map((cap) => (
                <tr key={cap.id} className={cap.enforcement === "ui-only" ? "mhole" : undefined}>
                  <th scope="row">
                    {cap.name}
                    {cap.costsMoney && <span className="pill loose" title="spends money on a model call">costs money</span>}
                    {cap.enforcement === "ui-only" && <span className="pill" title={cap.hole}>UI only</span>}
                  </th>
                  <Cell access={cap.student} role="Student" />
                  <Cell access={cap.faculty} role="Faculty" />
                  <Cell access={cap.admin} role="Admin" />
                  <td className="mgate">
                    {cap.gate.symbol}
                    <span className="mfile">{cap.gate.file}{cap.gate.line ? `:${cap.gate.line}` : ""}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* A matrix that shows only what is governed reads as a claim that
          everything is. These say what it does not cover. */}
      <ul className="mnotes">
        {MATRIX_NOTES.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </section>
  )
}
