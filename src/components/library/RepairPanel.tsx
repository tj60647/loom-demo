"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import {
  acceptRepair,
  applyRepairs,
  detectRepairs,
  getRepairSettings,
  rejectRepair,
  transcribeAllRepairs,
  transcribeRepair,
  type Refused,
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
 *
 * Everything a reviewer needs in order to act is on the surface, because the
 * first person to use this could not tell what was happening or why: the four
 * acts are named in order with the paid one marked, each region says whose turn
 * it is rather than showing the raw row status, the crop opens full size (it is
 * a whole page, and a page shrunk into a column cannot be checked against
 * anything), and what a run costs is stated before it is spent rather than
 * totalled afterwards. The settings dialog carries the rest — who the readers
 * are, what they are asked, how the vote is decided, and what would make a
 * write refuse.
 */

/** What one press of a paid button costs, measured on real regions. */
const COST_PER_REGION_USD = 0.2

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

type Settings = Awaited<ReturnType<typeof getRepairSettings>>

/**
 * What the readers are, and what they were told.
 *
 * Loaded when the dialog is first opened rather than with the page: it is
 * reference material, not part of the work, and every reading's panel would
 * otherwise carry a copy of the same prompt. Every value comes from the module
 * that uses it — the thresholds here are not a description of the pipeline, they
 * are the pipeline's own constants — so this cannot drift into confidently
 * describing a system that no longer exists.
 */
function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [failed, setFailed] = useState("")

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  useEffect(() => {
    if (!open || settings || failed) return
    getRepairSettings()
      .then(setSettings)
      .catch((error) => setFailed(error instanceof Error ? error.message : String(error)))
  }, [open, settings, failed])

  return (
    <dialog ref={dialog} className="repair-settings" onClose={onClose} onCancel={onClose}>
      <div className="repair-settings-head">
        <h3>How this reading gets read</h3>
        <button className="btn ghost mini" onClick={onClose}>Close</button>
      </div>

      {failed ? <p className="repair-error">{failed}</p> : null}
      {!settings && !failed ? <p className="hint">Loading…</p> : null}

      {settings ? (
        <div className="repair-settings-body">
          <section>
            <span className="label">The readers ({settings.readers.length})</span>
            <ol className="repair-readers">
              {settings.readers.map((model) => (
                <li key={model}>{model}</li>
              ))}
            </ol>
            <p className="hint">
              Independent and from different families on purpose: a panel only beats one good reader
              when the members&rsquo; mistakes are uncorrelated. The count is odd so a majority cannot
              tie. Each reads the crop alone and never sees the others&rsquo; answers.
            </p>
          </section>

          <section>
            <span className="label">How the vote is decided</span>
            <p className="hint">
              {settings.consensus.majorityBySize
                .map((row) => `${row.needed} of ${row.readers}`)
                .join(" · ")}
              {" — whoever answers, that many must back a sentence for it to carry."}
            </p>
            <ul className="repair-settings-list">
              <li><strong>Deciding a vote:</strong> {settings.consensus.decidedBy}</li>
              <li><strong>Grouping the losers for display:</strong> {settings.consensus.groupedBy}</li>
              <li>{settings.consensus.truncatedReadersExcluded}</li>
            </ul>
          </section>

          <section>
            <span className="label">What would refuse your decision</span>
            <ul className="repair-settings-list">
              <li>
                Accepted text must share at least{" "}
                <strong>{Math.round(settings.guards.acceptedOverlapFloor * 100)}%</strong>{" "}of its words
                with some reader&rsquo;s transcription. You may correct freely; this only catches text
                that came from somewhere other than this page.
              </li>
              <li>
                A written page must keep at least{" "}
                <strong>{Math.round(settings.guards.minKeptTextShare * 100)}%</strong>{" "}of its
                characters. Writing replaces the page&rsquo;s whole text layer, so a transcription of
                part of a page would delete the rest.
              </li>
              <li>Writing is refused outright while any highlight is anchored to the reading.</li>
              <li>Writing is refused if the PDF changed after the damage was measured.</li>
              <li>The result is discarded unless the damage actually falls.</li>
            </ul>
          </section>

          <section>
            <span className="label">How the picture is made</span>
            <p className="hint">
              Rendered at {settings.cropDpi}dpi, capped at {settings.maxCropEdge}px on the long edge
              (the readers downscale beyond that, so larger costs money and buys nothing). At most{" "}
              {settings.maxPagesPerRun} pages per run. A crop with less than{" "}
              {(settings.minCropInk * 100).toFixed(1)}% ink is refused rather than sent — a blank
              picture cannot be transcribed, and finding that out costs five model calls.
            </p>
          </section>

          <section>
            <span className="label">What each reader is told</span>
            <p className="hint">Verbatim. This is the whole brief; there is nothing else in the request.</p>
            <pre>{settings.systemPrompt}</pre>
            <pre>{settings.instructions}</pre>
          </section>
        </div>
      ) : null}
    </dialog>
  )
}

/**
 * What a transcription run actually produced.
 *
 * The panel below re-renders with the readings anyway, so this exists for the
 * one thing the rows do not say: how many of the five readers answered. A panel
 * that quietly ran with two is a weaker vote, and it looks exactly like a panel
 * that ran with five.
 */
function describeReading(result: {
  readers: number
  complete: number
  costUsd: number | null
  panel: number
  failures: { model: string; reason: string }[]
}) {
  const missed = result.failures.length
    ? ` Did not answer: ${result.failures.map((f) => `${f.model} (${f.reason})`).join("; ")}.`
    : ""
  return (
    `${result.readers} of ${result.panel} readers answered, ${result.complete} of them completely. ` +
    `This region cost ${money(result.costUsd)}.${missed}`
  )
}

/**
 * Whose turn it is — not the row's status word.
 *
 * `proposed` covers two states a reviewer needs to tell apart: nobody has read
 * this yet, and the readers are done and waiting on you. The row cannot
 * distinguish them; the presence of readings can.
 */
function stage(status: RepairRow["status"], hasReadings: boolean) {
  if (status === "proposed") return hasReadings ? "your decision" : "not read yet"
  if (status === "accepted") return "accepted · not yet written"
  if (status === "applied") return "written into the reading"
  return "rejected"
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
  const [notice, setNotice] = useState("")
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)

  /**
   * Every act here answers with a result rather than throwing, because a
   * refusal is a sentence the reviewer has to read and Next redacts thrown
   * messages in a production build. `describe` turns the ones worth confirming
   * into a line — a detection that found nothing and a detection that never ran
   * look identical otherwise.
   */
  const run = <T extends { ok: true }>(
    action: () => Promise<T | Refused>,
    describe?: (result: T) => string
  ) => {
    setError("")
    setNotice("")
    startTransition(async () => {
      try {
        const result = await action()
        if (!result.ok) {
          setError(result.error)
          return
        }
        if (describe) setNotice(describe(result))
      } catch (caught) {
        // The action itself no longer throws; this is the network, or a bug.
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    })
  }

  const everyCost = repairs.flatMap((repair) => repair.readings)
  const { total: grandTotal, partial } = sumCost(everyCost)
  const proposed = repairs.filter((repair) => repair.status === "proposed")
  const accepted = repairs.filter((repair) => repair.status === "accepted")

  const unread = proposed.filter((repair) => repair.readings.length === 0)

  return (
    <div className="repair-panel">
      {/* The order of acts, stated. Nothing else on this screen says that these
          four buttons are a sequence, which one costs money, or which one a
          student can see — and without that a reviewer is pressing buttons. */}
      <div className="repair-steps">
        <ol>
          <li><b>1</b> Find damaged pages <span className="hint">free · changes nothing</span></li>
          <li><b>2</b> Read them <span className="hint">costs ~{money(COST_PER_REGION_USD)} a page</span></li>
          <li><b>3</b> Decide <span className="hint">yours; nothing changes yet</span></li>
          <li><b>4</b> Write <span className="hint">the only step a student sees</span></li>
        </ol>
        <button
          className="btn ghost mini repair-gear"
          onClick={() => setSettingsOpen(true)}
          aria-label="How this reading gets read — readers, instructions and rules"
          data-tip="Who the readers are, what they are asked, how the vote is decided, and what would refuse your decision"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 5.2A2.8 2.8 0 1 0 8 10.8 2.8 2.8 0 0 0 8 5.2zm0 4.3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
            />
            <path
              fill="currentColor"
              d="M14 8c0-.4 0-.7-.1-1.1l1.3-1-1.5-2.6-1.6.6a5.6 5.6 0 0 0-1.8-1.1L10 1H7l-.3 1.8c-.7.2-1.3.6-1.8 1.1l-1.6-.6L1.8 5.9l1.3 1a6 6 0 0 0 0 2.2l-1.3 1 1.5 2.6 1.6-.6c.5.5 1.1.9 1.8 1.1L7 15h3l.3-1.8c.7-.2 1.3-.6 1.8-1.1l1.6.6 1.5-2.6-1.3-1c.1-.4.1-.7.1-1.1zm-1.6 1.6.2.5 1 .8-.5.9-1.2-.4-.4.4c-.5.5-1 .8-1.7 1l-.5.2-.2 1.2h-1l-.2-1.2-.5-.2a4 4 0 0 1-1.7-1l-.4-.4-1.2.4-.5-.9 1-.8.2-.5a4.3 4.3 0 0 1 0-1.7L3.6 7l-1-.8.5-.9 1.2.4.4-.4c.5-.5 1-.8 1.7-1l.5-.2.2-1.2h1l.2 1.2.5.2c.6.2 1.2.5 1.7 1l.4.4 1.2-.4.5.9-1 .8-.2.5a4.3 4.3 0 0 1 0 1.7z"
            />
          </svg>
          Settings
        </button>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="actrow">
        <button
          className="btn ghost mini"
          disabled={pending}
          onClick={() =>
            run(
              () => detectRepairs(sourceId),
              (result) => {
                // Naming these is the point. A page whose glyphs are correct
                // and whose spaces are gone is genuinely damaged and genuinely
                // not repairable by re-reading it — silence here would read as
                // "nothing wrong", which is the opposite of true.
                const skipped = result.unlocatable.length
                  ? ` Page${result.unlocatable.length === 1 ? "" : "s"} ` +
                    `${result.unlocatable.join(", ")} read as damaged but cannot be repaired this way: ` +
                    `the characters are right and the spaces between them are missing, so there is nothing ` +
                    `in the picture for a reader to correct.`
                  : ""
                // A blank crop is a bug in here, not a property of the reading,
                // and saying so is the difference between a report and a shrug.
                const empty = result.blank.length
                  ? ` Page${result.blank.length === 1 ? "" : "s"} ${result.blank.join(", ")} rendered ` +
                    `blank and were not proposed — that is a fault in this tool, not in the reading; ` +
                    `please report it.`
                  : ""
                return result.regions === 0
                  ? `No repairable page found across ${result.pagesExamined} examined.${skipped}${empty}`
                  : `${result.regions} page(s) to repair, of ${result.pagesExamined} examined.${skipped}${empty}`
              }
            )
          }
          data-tip="Reads the file and proposes pages. Free, repeatable, and it changes nothing."
        >
          1 · Find damaged pages
        </button>
        {unread.length > 0 ? (
          <button
            className="btn ghost mini"
            disabled={pending}
            onClick={() =>
              run(
                () => transcribeAllRepairs(sourceId),
                (result) =>
                  `Reading ${result.queued} page(s) in the background. Each lands as it finishes — ` +
                  `reload to see them. Pressing this again skips pages already read, so it is safe to retry.`
              )
            }
            data-tip="Reads every page that has not been read yet. Safe to re-run — finished pages are skipped."
          >
            2 · Read all {unread.length} unread · ~{money(unread.length * COST_PER_REGION_USD)}
          </button>
        ) : null}
        {/* Apply is the only act on this panel a student can see, so it names
            what it will do rather than saying "apply". It stays pressable when
            highlights exist: the refusal is the server's to give, and its
            message counts them. */}
        {accepted.length > 0 ? (
          <button
            className="btn mini"
            disabled={pending}
            onClick={() =>
              run(
                () => applyRepairs(sourceId),
                (result) =>
                  // pagesReplaced is the page NUMBERS, not a count — naming them
                  // is also what a reviewer wants to read back.
                  `Written into a new revision. Replaced the text layer of page` +
                  `${result.pagesReplaced.length === 1 ? "" : "s"} ` +
                  `${result.pagesReplaced.join(", ")}; the reading now measures ` +
                  `${result.damagedPagesAfter} damaged page(s), from ${result.damagedPagesBefore}. ` +
                  `The original file is still stored under its old key.`
              )
            }
            data-tip="Writes every accepted transcription into a new revision of the PDF, then re-extracts and rescores it. The original file is kept."
          >
            4 · Write {accepted.length} accepted page{accepted.length === 1 ? "" : "s"} into the reading
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
      {notice ? <p className="repair-notice">{notice}</p> : null}
      {pending ? (
        <p className="hint">
          Working — a page takes a minute or two, because every reader transcribes it independently and
          they run at the speed of the slowest one.
        </p>
      ) : null}

      {hasHighlights > 0 ? (
        <p className="hint">
          {hasHighlights} highlight{hasHighlights === 1 ? "" : "s"} anchored to this reading. Repairs can be
          reviewed, but applying one would move the text those highlights were measured against — so it is
          refused. Repair before a cohort works in a reading, not after.
        </p>
      ) : null}

      {repairs.length === 0 ? (
        <p className="hint">
          Nothing found yet — start with step 1. It reads the file, proposes the pages a re-reading
          could fix, and changes nothing.
        </p>
      ) : null}

      {repairs.map((repair) => {
        const draft = drafts[repair.id] ?? repair.acceptedText ?? repair.agreedText
        return (
          <section key={repair.id} className="repair-region">
            <h4>
              Page {repair.pageNumber}
              <span className={`pill mini repair-${repair.status}`}>
                {stage(repair.status, repair.readings.length > 0)}
              </span>
              {repair.garbleRate != null ? (
                <span className="hint"> {(repair.garbleRate * 100).toFixed(0)}% of this page&rsquo;s words are not words</span>
              ) : null}
            </h4>

            <div className="repair-split">
              <figure>
                {/* The crop is a whole PAGE — the unit of repair has to match the
                    unit of replacement — and a page shrunk into this column
                    cannot be checked against a transcription, which is the only
                    thing this screen is for. So it opens at full size. */}
                <a
                  href={`/api/repairs/${repair.id}/crop`}
                  target="_blank"
                  rel="noreferrer"
                  data-tip="Open this page at full size, to read against the transcription"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/repairs/${repair.id}/crop`} alt={`Page ${repair.pageNumber} of this reading, as the readers see it`} />
                </a>
                <figcaption className="hint">
                  {repair.region.width}×{repair.region.height}px — click to open full size
                </figcaption>
              </figure>

              <div>
                <span className="label">What the PDF says here now</span>
                <pre className="repair-damaged">{repair.currentText.slice(0, 600)}</pre>
                <p className="hint">Not words: {repair.garbledWords.slice(0, 14).join(" · ")}</p>

                {repair.readings.length === 0 ? (
                  <>
                    <button
                      className="btn ghost mini"
                      disabled={pending}
                      onClick={() => run(() => transcribeRepair(repair.id), describeReading)}
                      data-tip="Sends this page to every reader at once and records what each one saw"
                    >
                      2 · Read this page · ~{money(COST_PER_REGION_USD)}
                    </button>
                    <p className="hint">
                      Nothing has been spent on this page yet. Check the picture opens and is legible
                      before reading it — a page that is blank or unreadable here will come back empty
                      from every reader.
                    </p>
                  </>
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
                    {repair.disagreements.length > 0 && (
                      // Which model said what, where it is being read. The names
                      // otherwise live only in the cost table further down, so
                      // "Reader 4" is an unresolvable reference at the moment a
                      // reviewer is trying to weigh two readings against each other.
                      <p className="hint">
                        Readers, in order:{" "}
                        {repair.readings
                          .slice()
                          .sort((a, b) => a.reader - b.reader)
                          .map((reading) => `${reading.reader} ${reading.model}`)
                          .join(" · ")}
                      </p>
                    )}

                    <span className="label">Text to write into the page</span>
                    <textarea
                      value={draft}
                      rows={10}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [repair.id]: event.target.value }))
                      }
                    />
                    {/* The box starts from the agreed text, which on a hard page
                        is a fraction of it — 325 characters of a 1,485-character
                        newspaper page, once. A reviewer who does not know that
                        reads the short box as the answer. */}
                    <p className="hint">
                      Starts from the sentences a majority backed
                      {repair.currentText.length > 0 ? (
                        <>
                          {" "}
                          — <strong>{draft.trim().length}</strong> characters against roughly{" "}
                          <strong>{repair.currentText.length}</strong> on the page
                        </>
                      ) : null}
                      . On a page the readers found hard that will be far short of the whole thing, and
                      you are expected to compose the rest from their transcriptions below. Writing
                      replaces the page&rsquo;s entire text layer, so whatever is missing here is lost from
                      the reading — a draft well under the page&rsquo;s length is refused for that reason.
                      Edit freely: it is checked against the readers&rsquo; words, not against your changes.
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
                          onClick={() =>
                            run(
                              () => acceptRepair(repair.id, draft),
                              (result) =>
                                `Page ${result.pageNumber} accepted. Nothing has changed in the reading yet — ` +
                                `use the write button at the top when every region is decided.`
                            )
                          }
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
                          onClick={() => run(() => transcribeRepair(repair.id), describeReading)}
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
