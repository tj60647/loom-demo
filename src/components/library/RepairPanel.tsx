"use client"

import { useState, useTransition } from "react"
import {
  acceptRepair,
  detectRepairs,
  rejectRepair,
  transcribeAllRepairs,
  transcribeRepair,
} from "@/actions/repairs"

/**
 * Reviewing proposed repairs to a damaged reading.
 *
 * The screen is arranged around the one question a reviewer can answer that no
 * measurement can: does this transcription match the page? So the crop sits
 * beside the text at all times, and the passages the readers DISAGREED on come
 * before the ones they agreed on — agreement is not proof of correctness (four
 * models can be wrong together), but disagreement is proof that something needs
 * a person, and it is where attention is worth most.
 *
 * Costs are shown per reader rather than as a total, because the totals hide
 * the thing worth knowing. Measured on one real region: one model accounted for
 * 79% of the spend and five times the wall-clock while returning the same
 * quality as the cheapest reader. A single number would have said "$0.74" and
 * left that invisible.
 */

type Reading = {
  id: string
  reader: number
  model: string
  text: string
  uncertain: string[]
  illegibleShare: string | null
  promptTokens: number | null
  completionTokens: number | null
  costUsd: number | null
  durationMs: number | null
  truncated: boolean
}

type Votes = {
  readers: number
  majority: number
  distinctSentences: number
  distribution: number[]
  perReader: { reader: number; withMajority: number; outvoted: number; solo: number; agreementRate: number }[]
}

export type RepairRow = {
  id: string
  pageNumber: number
  status: "proposed" | "accepted" | "rejected" | "applied"
  region: { x: number; y: number; width: number; height: number; scale: number }
  currentText: string
  garbledWords: string[]
  garbleRate: number | null
  agreedText: string
  disagreements: { passage: string; readings: string[] }[]
  votes: Votes | null
  acceptedText: string | null
  reviewNote: string
  readings: Reading[]
}

function money(value: number | null) {
  if (value == null) return "—"
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

/** Null costs are unknown, not free — a total that swallows them lies. */
function sumCost(readings: Reading[]) {
  if (readings.length === 0) return { total: null as number | null, partial: false }
  const known = readings.filter((r) => r.costUsd != null)
  return {
    total: known.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    partial: known.length !== readings.length,
  }
}

/**
 * How the vote went.
 *
 * Shown per reader rather than as a headline agreement figure, because the
 * headline hides the thing worth acting on: a reader consistently outvoted is a
 * reader to replace, and one producing sentences nobody else saw is either
 * reading something real that the others missed or inventing — both worth a
 * look, and neither visible in the accepted text.
 */
function VoteTable({ votes, readings }: { votes: Votes; readings: Reading[] }) {
  const modelOf = (reader: number) =>
    readings.find((reading) => reading.reader === reader)?.model ?? `Reader ${reader}`

  return (
    <>
      <table className="repair-costs">
        <thead>
          <tr>
            <th>Reader</th>
            <th>With majority</th>
            <th>Outvoted</th>
            <th>Solo</th>
            <th>Agreed</th>
          </tr>
        </thead>
        <tbody>
          {votes.perReader.map((stat) => (
            <tr key={stat.reader}>
              <td>{modelOf(stat.reader)}</td>
              <td>{stat.withMajority}</td>
              <td>{stat.outvoted}</td>
              <td>{stat.solo}</td>
              <td>{Math.round(stat.agreementRate * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {votes.distinctSentences} distinct sentences across {votes.readers} readers; {votes.majority} needed
        to carry. Backed by:{" "}
        {votes.distribution
          .map((count, backing) => (backing > 0 && count > 0 ? `${backing}→${count}` : null))
          .filter(Boolean)
          .join(" · ")}
        . A sentence only one reader saw is either something the others missed or something invented.
      </p>
    </>
  )
}

function CostTable({ readings }: { readings: Reading[] }) {
  if (readings.length === 0) return null
  const { total, partial } = sumCost(readings)

  return (
    <table className="repair-costs">
      <thead>
        <tr>
          <th>Reader</th>
          <th>In</th>
          <th>Out</th>
          <th>Time</th>
          <th>Cost</th>
        </tr>
      </thead>
      <tbody>
        {readings.map((reading) => (
          <tr key={reading.id}>
            <td>
              {reading.model}
              {reading.truncated ? <span className="hint"> · ran out, excluded from the vote</span> : null}
            </td>
            <td>{reading.promptTokens?.toLocaleString() ?? "—"}</td>
            <td>{reading.completionTokens?.toLocaleString() ?? "—"}</td>
            <td>{reading.durationMs == null ? "—" : `${Math.round(reading.durationMs / 1000)}s`}</td>
            <td>{money(reading.costUsd)}</td>
          </tr>
        ))}
        <tr className="repair-costs-total">
          <td colSpan={4}>
            This region{partial ? " (some readers did not report a cost)" : ""}
          </td>
          <td>{money(total)}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default function RepairPanel({
  sourceId,
  repairs,
  hasHighlights,
}: {
  sourceId: string
  repairs: RepairRow[]
  hasHighlights: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const run = (action: () => Promise<unknown>) => {
    setError("")
    startTransition(async () => {
      try {
        await action()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    })
  }

  const everyCost = repairs.flatMap((repair) => repair.readings)
  const { total: grandTotal, partial } = sumCost(everyCost)
  const proposed = repairs.filter((repair) => repair.status === "proposed")

  return (
    <div className="repair-panel">
      <div className="actrow">
        <button className="btn ghost mini" disabled={pending} onClick={() => run(() => detectRepairs(sourceId))}>
          Find damaged regions
        </button>
        {proposed.length > 0 ? (
          <button
            className="btn ghost mini"
            disabled={pending}
            onClick={() => run(() => transcribeAllRepairs(sourceId))}
            data-tip="Reads every region that has not been read yet. Safe to re-run — finished regions are skipped."
          >
            Read all {proposed.length} unread
          </button>
        ) : null}
        {everyCost.length > 0 ? (
          <span className="hint">
            Spent so far: <strong>{money(grandTotal)}</strong>
            {partial ? " (plus readers that reported no cost)" : ""} across {everyCost.length} readings
          </span>
        ) : null}
      </div>

      {error ? <p className="repair-error">{error}</p> : null}

      {hasHighlights > 0 ? (
        <p className="hint">
          {hasHighlights} highlight{hasHighlights === 1 ? "" : "s"} anchored to this reading. Repairs can be
          reviewed, but applying one would move the text those highlights were measured against — so it is
          refused. Repair before a cohort works in a reading, not after.
        </p>
      ) : null}

      {repairs.length === 0 ? (
        <p className="hint">No damaged regions found yet. &ldquo;Find damaged regions&rdquo; is free and changes nothing.</p>
      ) : null}

      {repairs.map((repair) => {
        const draft = drafts[repair.id] ?? repair.acceptedText ?? repair.agreedText
        return (
          <section key={repair.id} className="repair-region">
            <h4>
              Page {repair.pageNumber}
              <span className={`pill mini repair-${repair.status}`}>{repair.status}</span>
              {repair.garbleRate != null ? (
                <span className="hint"> {(repair.garbleRate * 100).toFixed(0)}% of this page&rsquo;s words are not words</span>
              ) : null}
            </h4>

            <div className="repair-split">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/repairs/${repair.id}/crop`} alt={`Damaged region on page ${repair.pageNumber}`} />
                <figcaption className="hint">
                  {repair.region.width}×{repair.region.height}px
                </figcaption>
              </figure>

              <div>
                <span className="label">What the PDF says here now</span>
                <pre className="repair-damaged">{repair.currentText.slice(0, 600)}</pre>
                <p className="hint">Not words: {repair.garbledWords.slice(0, 14).join(" · ")}</p>

                {repair.readings.length === 0 ? (
                  <button
                    className="btn ghost mini"
                    disabled={pending}
                    onClick={() => run(() => transcribeRepair(repair.id))}
                  >
                    Read this region
                  </button>
                ) : (
                  <>
                    <span className="label">
                      Where the readers differ — look here first ({repair.disagreements.length})
                      {repair.votes ? (
                        <span className="hint">
                          {" "}
                          · {Math.round((repair.votes.distinctSentences
                            ? (repair.votes.distinctSentences - repair.disagreements.length) /
                              repair.votes.distinctSentences
                            : 0) * 100)}
                          % carried a majority
                        </span>
                      ) : null}
                    </span>
                    {repair.disagreements.length === 0 ? (
                      <p className="hint">
                        Every reader agreed. That is not proof of correctness — check it against the crop.
                      </p>
                    ) : (
                      <ul className="repair-disagreements">
                        {repair.disagreements.slice(0, 12).map((item, index) => (
                          <li key={index}>
                            <div className="repair-passage">{item.passage}</div>
                            <ul>
                              {item.readings.map((reading, readingIndex) => (
                                <li key={readingIndex}>{reading}</li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}

                    <span className="label">Text to write into the page</span>
                    <textarea
                      value={draft}
                      rows={10}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [repair.id]: event.target.value }))
                      }
                    />
                    <p className="hint">
                      Starts from what every reader agreed. Edit freely — it is checked against the readings,
                      not against your changes, so corrections pass and text from somewhere else does not.
                    </p>

                    {repair.votes ? (
                      <>
                        <span className="label">How the vote went</span>
                        <VoteTable votes={repair.votes} readings={repair.readings} />
                      </>
                    ) : null}

                    <span className="label">What this region cost</span>
                    <CostTable readings={repair.readings} />

                    <details>
                      <summary className="hint">Each reader&rsquo;s full transcription</summary>
                      {repair.readings.map((reading) => (
                        <div key={reading.id}>
                          <span className="label">
                            {reading.model} · {reading.illegibleShare ?? "unstated"} illegible ·{" "}
                            {reading.uncertain.length} flagged
                          </span>
                          <pre>{reading.text}</pre>
                          {reading.uncertain.length > 0 ? (
                            <p className="hint">Unsure of: {reading.uncertain.join(" · ")}</p>
                          ) : null}
                        </div>
                      ))}
                    </details>

                    {repair.status === "proposed" ? (
                      <div className="actrow">
                        <button
                          className="btn mini"
                          disabled={pending || !draft.trim()}
                          onClick={() => run(() => acceptRepair(repair.id, draft))}
                        >
                          Accept this text
                        </button>
                        <button
                          className="btn ghost mini"
                          disabled={pending}
                          onClick={() => {
                            const note = window.prompt("Why are you rejecting this? The next reader needs to know.")
                            if (note?.trim()) run(() => rejectRepair(repair.id, note))
                          }}
                        >
                          Reject
                        </button>
                        <button
                          className="btn ghost mini"
                          disabled={pending}
                          onClick={() => run(() => transcribeRepair(repair.id))}
                          data-tip="Ask the readers again. Costs the same as the first time."
                        >
                          Re-read
                        </button>
                      </div>
                    ) : (
                      <p className="hint">
                        {repair.status}
                        {repair.reviewNote ? ` — ${repair.reviewNote}` : ""}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
