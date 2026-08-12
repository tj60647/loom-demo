"use client"

// 04 · Vocabulary — the User's holdings (model §3 tab 4).
//
// This tab is deliberately UNSCOPED where every other workbench tab is scoped.
// A concept does not belong to a reading (a passage does), so your vocabulary
// is the whole lexicon you have built across every text, not this reading's
// slice of it. 01 Reading's "Your work" (the Capture Log) stays the
// reading-scoped record of what you captured *here*; this is the list of words
// you now own.
//
// It holds what the model gives Vocabulary and nothing else: browse/filter
// Concepts as full objects and Link Labels, recurrence, edit Descriptions,
// merge Concepts (HIDDEN — see MERGE_VISIBLE), and the Concepts/Links
// Overlays. The cloth-reflection prompts and "Your read" that used to live on
// 03 moved to 04 · Knowledge Graph, where the projection they describe already
// lives (TJ, 2026-08-08).

import { useMemo, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import { useDialog } from "@/components/providers/DialogProvider"
import type { Concept } from "@/lib/types"
import { soleSourceId } from "@/lib/scope"
import { sortedByLabel } from "@/lib/utils"
import { usesOf } from "@/lib/linkResolve"
import ObjectDownload from "@/components/ui/ObjectDownload"
import { buildVocabularyExport, buildVocabularyMarkdown } from "@/lib/objectExport"
import VocabularyOverlay from "@/components/tabs/VocabularyOverlay"

/**
 * Merge, behind a curtain (TJ, 2026-08-12): *"hide the merge capability in the
 * concepts list in vocabulary. we need to resolve what this really means and
 * its consequences."*
 *
 * HIDDEN, NOT REMOVED. The `mergeConcepts` action, its provider method, the
 * `concept.merge` event and the sandbox's copy of it all stand — a merge
 * already performed still renders in the Capture Log, and turning this to
 * `true` puts the control back exactly where it was. Nothing about the data
 * changed, so nothing here is a migration.
 *
 * WHAT IS UNRESOLVED. Merge is the one irreversible act a student can perform
 * on their own vocabulary — "There is no unmerge" — and it is offered at the
 * moment they are least able to judge it: two concepts share a label, and the
 * only thing on screen telling them apart is a passage count. The same
 * argument is already ratified for Link merge (open-work 5.1e, TJ 2026-08-11:
 * hold it longest — "wait until a real vocabulary is observed to silt up
 * rather than building a fixer for a mess nobody has made"). Concept merge was
 * built before that reasoning existed and never re-examined under it.
 *
 * WHAT IT COSTS WHILE HIDDEN — the duplicate a student makes is now repaired
 * by hand rather than in one act: file the passages under the concept you are
 * keeping (Your work, or "also file this passage under another concept"), then
 * remove the other — its passages survive the deletion, unlabeled, since
 * migration 0021. Every dialog that used to say "merge them" says that
 * instead. Homonyms stay legal and stay warned-never-forbidden (ruling 36);
 * what is gone is the one-click repair, not the state it repaired.
 */
const MERGE_VISIBLE: boolean = false

/** Case- and space-insensitive contains, so "object worlds" finds "Object  Worlds". */
function matches(haystack: string | null | undefined, needle: string) {
  if (!needle) return true
  return (haystack ?? "").toLowerCase().replace(/\s+/g, " ").includes(needle)
}

export default function VocabularyTab() {
  const {
    state, scope, scoped,
    editConcept, removeConcept, mergeConcepts, editEdge, flash,
    addLink, editLink,
  } = useLoom()
  const { titleOf, course } = useReadings()
  const isStaff = !!course?.isStaff
  const { confirm, notify } = useDialog()

  const [conceptFilter, setConceptFilter] = useState("")
  const [labelFilter, setLabelFilter] = useState("")
  const [openConcepts, setOpenConcepts] = useState<Record<string, boolean>>({})
  const [openLabels, setOpenLabels] = useState<Record<string, boolean>>({})
  const [mergeInputs, setMergeInputs] = useState<Record<string, string>>({})
  const [mergeBusy, setMergeBusy] = useState<Record<string, boolean>>({})
  const [coinLabel, setCoinLabel] = useState("")
  const [coining, setCoining] = useState(false)

  /**
   * Coin a Link with nothing using it yet. Reuse is silent by design: asking
   * for a word you already own opens the one you have rather than warning —
   * the point of the object is that reaching for a word twice is ONE word,
   * and a dialog there would teach that recurrence is exceptional when it is
   * the goal.
   */
  const coin = async () => {
    const label = coinLabel.trim()
    if (!label || coining) return
    setCoining(true)
    try {
      const link = await addLink(label)
      setCoinLabel("")
      setOpenLabels((p) => ({ ...p, [link.id]: true }))
      flash("· added ·")
    } catch (err) {
      flash(err instanceof Error ? err.message : "could not add that")
    } finally {
      setCoining(false)
    }
  }

  const cq = conceptFilter.trim().toLowerCase().replace(/\s+/g, " ")
  const lq = labelFilter.trim().toLowerCase().replace(/\s+/g, " ")

  /**
   * Recurrence, per the model's "recurrence designations": how many DISTINCT
   * readings evidence a concept. That is the number that means something —
   * four passages from one text is depth, one passage from each of four is a
   * concept that travels. Counted from `sourceId` so a reference-only reading
   * (no PDF) still counts, and unattributed passages never collapse together.
   */
  const conceptStats = useMemo(() => {
    const stats = new Map<string, { passages: number; readings: string[] }>()
    for (const concept of state.concepts) stats.set(concept.id, { passages: 0, readings: [] })
    for (const passage of state.passages) {
      for (const conceptId of passage.conceptIds) {
        const row = stats.get(conceptId)
        if (!row) continue
        row.passages += 1
        const key = passage.sourceId ?? (passage.source ? `t:${passage.source}` : null)
        if (key && !row.readings.includes(key)) row.readings.push(key)
      }
    }
    return stats
  }, [state.concepts, state.passages])

  const readingName = (key: string) =>
    key.startsWith("t:") ? key.slice(2) : titleOf(key) ?? "a reading"

  /**
   * Link Labels are the student's own coinages, so they group by the label
   * itself rather than by edge: reaching for "shapes" on four threads is one
   * word used four times. Unlabeled links are collected under a null key —
   * they are legal (a Description without a Label is the ruled order) and
   * hiding them would make the list lie about how much is still loose.
   */
  /**
   * The Link List, read from the OBJECTS the student owns (5.1) rather than
   * derived by grouping strings off threads. Two consequences worth naming:
   *
   *  · A Link with NO thread is a row here. That state is the reason the
   *    object exists (TJ, 2026-08-10) and it was unrepresentable before.
   *  · The old grouping keyed on a TRIMMED but case-SENSITIVE handle, so
   *    "Leads to" and "leads to" were two rows. Links fold case, so such a
   *    loom now shows one. That is a correction, not a loss — the two were
   *    always one word — and the merge of true duplicates lands in 5.1c.
   */
  const linkRows = useMemo(() => {
    const uses = usesOf(state.links, state.edges)
    return state.links
      .map((link) => ({ link, edges: uses.get(link.id) ?? [] }))
      .sort((a, b) => b.edges.length - a.edges.length || a.link.label.localeCompare(b.link.label))
  }, [state.links, state.edges])

  // Threads carrying no label at all — still edge-derived, because that is
  // what they are. Guarded on BOTH: while `handle` survives, a thread can
  // carry a legacy label with no linkId and is not loose.
  const looseLinks = state.edges.filter((e) => !e.linkId && !(e.handle ?? "").trim())

  const labelOf = (id: string) => state.concepts.find((c) => c.id === id)?.label ?? "?"

  const visibleConcepts = sortedByLabel(state.concepts).filter(
    (c) => matches(c.label, cq) || matches(c.def, cq)
  )
  const visibleLabels = linkRows.filter(
    ({ link, edges }) =>
      matches(link.label, lq) ||
      matches(link.description, lq) ||
      edges.some((e) => matches(e.sentence, lq))
  )

  /**
   * Every other concept, as merge targets. Labels that appear more than once
   * carry their passage count, because that is the only thing on screen that
   * distinguishes two legal homonyms — and picking the wrong one is not
   * recoverable ("There is no unmerge").
   */
  const mergeTargets = (sourceId: string) => {
    const seen = new Map<string, number>()
    for (const c of state.concepts) {
      const key = c.label.trim().toLowerCase()
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return sortedByLabel(state.concepts.filter((c) => c.id !== sourceId)).map((c) => {
      const dup = (seen.get(c.label.trim().toLowerCase()) ?? 0) > 1
      const n = state.passages.filter((b) => b.conceptIds.includes(c.id)).length
      return {
        id: c.id,
        label: dup ? `${c.label} — ${n} passage${n === 1 ? "" : "s"}` : c.label,
      }
    })
  }

  const handleMerge = async (source: Concept) => {
    // BY OBJECT, not by label string. `mergeInputs` holds a concept id now,
    // because a label cannot identify a concept: the model says so outright
    // ("Identity is by object, not label string") and homonyms are a ratified
    // legal state. Resolving with `.find()` on the label meant that with two
    // concepts named "framing" this silently absorbed whichever was created
    // first — and the confirm below renders `target.label`, identical for
    // both, so the dialog could not even say which one it was about to take.
    const targetId = mergeInputs[source.id] ?? ""
    const target = state.concepts.find((c) => c.id === targetId)
    if (!target || target.id === source.id) {
      await notify({
        title: "Pick the concept to keep first.",
        body: "Merging repairs a duplicate you already have — choose the one that stays, then Merge.",
      })
      return
    }
    // Always confirm: the source concept goes away, and there is no unmerge.
    const ok = await confirm({
      title: `Merge “${source.label}” into “${target.label}”?`,
      body: "Every passage and thread of the first will point at the second, and the first goes away. There is no unmerge.",
      confirmLabel: "Merge",
      danger: true,
    })
    if (!ok) return
    setMergeBusy((prev) => ({ ...prev, [source.id]: true }))
    try {
      await mergeConcepts(source.id, target.id)
      setMergeInputs((prev) => ({ ...prev, [source.id]: "" }))
      setOpenConcepts((prev) => ({ ...prev, [target.id]: true }))
    } catch {
      // mergeConcepts resyncs and flashes before rethrowing; swallow here.
    } finally {
      setMergeBusy((prev) => ({ ...prev, [source.id]: false }))
    }
  }

  const handleRemoveConcept = async (concept: Concept, passages: number) => {
    // Threads first: a concept woven into one cannot be deleted out from under
    // it. The server enforces this too — this is the readable version.
    if (state.edges.some((e) => e.fromId === concept.id || e.toId === concept.id)) {
      await notify({
        title: "This concept is woven into a thread.",
        body: "Remove the thread on 02 · Linking first — deleting the concept now would take your thread with it.",
      })
      return
    }
    // With merge hidden, deleting the row you are not keeping IS the duplicate
    // repair — so this says where the passages go (01 · Reading, Your work,
    // under Unlabeled) rather than leaving "unfiled" as a word with no place
    // attached. It said "Export from Keep first" until 2026-08-12, four days
    // after Keep was deleted; the vocabulary downloads at the head of this tab.
    const ok = await confirm({
      title: `Delete “${concept.label}”?`,
      body: passages
        ? `Its ${passages} captured passage${passages !== 1 ? "s" : ""} stay${passages !== 1 ? "" : "s"} in your work on ${passages !== 1 ? "their readings" : "its reading"}, under Unlabeled — file them under another concept whenever you like. Download your vocabulary first if you might want the concept itself back.`
        : "Download your vocabulary first if you might want this back.",
      confirmLabel: "Delete concept",
      danger: true,
    })
    if (ok) removeConcept(concept.id)
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap" }}>
        <p className="tasktitle" style={{ margin: 0 }}>Your vocabulary.</p>
        {/* The holdings download where they live (TJ, 2026-08-10). Unscoped,
            like the tab: every concept and label you own, whatever reading
            evidenced it. */}
        <ObjectDownload
          kind="vocabulary"
          slug="vocabulary"
          tip="every concept and link label you own, with what evidences them"
          json={(p) => JSON.stringify(buildVocabularyExport(state, p), null, 2)}
          markdown={(p) => buildVocabularyMarkdown(state, p)}
        />
      </div>
      <p className="tasksub">
        Every concept you have named and every label you have given a link — across all
        your readings, not just this one. A concept does not belong to a text; it emerges from
        one and may then be evidenced in several. Sharpen a description, and see which of
        your words are becoming yours.
      </p>

      <div className="two">
        <div className="card">
          <h2>
            Concepts{" "}
            <span className="n">
              {state.concepts.length ? `(${state.concepts.length})` : ""}
            </span>
          </h2>
          <p className="hint">
            Click a concept to open it — edit its description, and see which readings
            evidence it. Two rows with the same name are two concepts, which is legal:
            if they are one idea, file the passages under the one you are keeping and
            remove the other.
          </p>
          <div className="quietrow" style={{ marginBottom: "10px" }}>
            <input
              id="conceptFilter"
              placeholder="filter your concepts…"
              aria-label="Filter concepts"
              value={conceptFilter}
              onChange={(e) => setConceptFilter(e.target.value)}
            />
          </div>

          <div className="scrollbox">
            {state.concepts.length === 0 && (
              <div className="empty">
                <span className="cap">your vocabulary fills as you capture</span>
              </div>
            )}
            {state.concepts.length > 0 && visibleConcepts.length === 0 && (
              <p className="empty">No concept matches “{conceptFilter.trim()}”.</p>
            )}
            {visibleConcepts.map((concept) => {
              const stats = conceptStats.get(concept.id) ?? { passages: 0, readings: [] }
              const isOpen = openConcepts[concept.id]
              return (
                <div key={concept.id} className={`lrow ${isOpen ? "open" : ""}`} data-concept-id={concept.id}>
                  <div
                    className="lhead"
                    onClick={() => setOpenConcepts((p) => ({ ...p, [concept.id]: !p[concept.id] }))}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <div className="lconcept" style={{ flex: 1 }}>{concept.label}</div>
                    <div className="lsrc">
                      {stats.passages} passage{stats.passages !== 1 ? "s" : ""}
                      {stats.readings.length > 1 ? ` · ${stats.readings.length} readings` : ""}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="lbody">
                      <div className="defrow">
                        <span className="label">Description</span>
                        <input
                          className="conceptDescription"
                          placeholder="in your words; same sense across your sources?"
                          defaultValue={concept.def ?? ""}
                          onBlur={(e) => {
                            if (e.target.value !== (concept.def ?? "")) {
                              editConcept(concept.id, { def: e.target.value })
                              flash("description saved")
                            }
                          }}
                        />
                      </div>

                      {stats.readings.length > 0 ? (
                        <p className="ghostnote" style={{ marginTop: "10px" }}>
                          Evidenced in{" "}
                          {stats.readings.map((key, i) => (
                            <span key={key}>
                              {i > 0 && (i === stats.readings.length - 1 ? " and " : ", ")}
                              <i>{readingName(key)}</i>
                            </span>
                          ))}
                          {stats.readings.length > 1
                            ? " — one concept, evidence from several texts."
                            : "."}
                        </p>
                      ) : (
                        /* A designation, not a warning (TJ, 2026-08-08: "a
                           Concept may precede its evidence"; red line 4:
                           "empty states are visible, not blocked"). This said
                           "every concept SHOULD trace to something you
                           captured", in red — an instruction to fix a state
                           the model made first-class that same week. */
                        <p className="ghostnote" style={{ marginTop: "10px" }}>
                          No passage evidences this yet. You may have named it ahead of
                          finding it, or its passages may have moved on.
                        </p>
                      )}

                      {MERGE_VISIBLE && <div className="quietrow" style={{ marginTop: "12px" }}>
                        {/* A picker, not a text field. Typing a NAME to choose
                            an OBJECT is the bug: two concepts may legally share
                            one label, and then no amount of typing can say
                            which. Homonyms carry their passage count so they
                            can be told apart at the moment it matters. */}
                        <select
                          className="tinput inline"
                          style={{ flex: 1 }}
                          aria-label={`Merge “${concept.label}” into`}
                          title="the same idea captured twice? pick the concept to keep — this one's passages and threads move onto it"
                          value={mergeInputs[concept.id] ?? ""}
                          onChange={(e) =>
                            setMergeInputs((p) => ({ ...p, [concept.id]: e.target.value }))
                          }
                        >
                          <option value="">merge into another concept…</option>
                          {mergeTargets(concept.id).map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                        <button
                          className="btn ghost mini"
                          onClick={() => handleMerge(concept)}
                          disabled={!!mergeBusy[concept.id]}
                        >
                          Merge
                        </button>
                      </div>}
                      <button
                        type="button"
                        className="rm"
                        style={{ background: "none", border: "none", padding: 0, marginTop: "12px" }}
                        onClick={() => handleRemoveConcept(concept, stats.passages)}
                      >
                        remove concept
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <h2>
            Link Labels{" "}
            <span className="n">{linkRows.length ? `(${linkRows.length})` : ""}</span>
          </h2>
          <p className="hint">
            The words you use to label the relations themselves — yours, across every
            reading. A label you reach for again is a word becoming yours; open one to
            give it your own description and read the threads that use it.
          </p>
          <div className="quietrow" style={{ marginBottom: "10px" }}>
            <input
              id="labelFilter"
              placeholder="filter your labels…"
              aria-label="Filter link labels"
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
            />
          </div>

          {/* A Link with no thread using it — TJ, 2026-08-10: "it is possible
              to have a link with label and definition without it being used in
              a thread". Here rather than in the throw bench, because the bench
              is for connecting two concepts and the design note keeps a gloss
              field out of that flow.

              It says "add", not "coin" (TJ, 2026-08-12: the language moves from
              coining a label to labelling a link). This is the one place where
              "label the link" cannot be said, because there is no link yet —
              so it is the plainest verb instead. The handler is still `coin()`
              and the event is still `link.coin`: the record keeps its own
              names. */}
          <div className="quietrow" style={{ marginBottom: "10px", gap: "6px" }}>
            <input
              id="coinLabel"
              placeholder="add a label — e.g. leads to"
              aria-label="Add a new link label"
              value={coinLabel}
              onChange={(e) => setCoinLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") coin() }}
            />
            <button className="btn mini" onClick={coin} disabled={!coinLabel.trim() || coining}>
              {coining ? "…" : "Add"}
            </button>
          </div>

          <div className="scrollbox">
            {linkRows.length === 0 && (
              <div className="empty">
                <span className="cap">no labels yet — add one, or throw a thread and label the link</span>
              </div>
            )}
            {linkRows.length > 0 && visibleLabels.length === 0 && (
              <p className="empty">No label matches “{labelFilter.trim()}”.</p>
            )}
            {visibleLabels.map(({ link, edges }) => {
              const label = link.label
              const isOpen = openLabels[link.id]
              return (
                <div key={link.id} className={`lrow ${isOpen ? "open" : ""}`} data-link-id={link.id} data-link-label={label}>
                  <div
                    className="lhead"
                    onClick={() => setOpenLabels((p) => ({ ...p, [link.id]: !p[link.id] }))}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <div className="lconcept" style={{ flex: 1 }}>{label}</div>
                    <div className="lsrc">
                      {/* Counted, never judged: a label no thread uses yet is a
                          designation, exactly as "no evidence" is for a concept. */}
                      {edges.length} thread{edges.length !== 1 ? "s" : ""}
                      {edges.length > 1 ? " · recurring" : ""}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="lbody">
                      {/* The LINK's own description — one meaning, shared by
                          every thread using it. Distinct from each thread's
                          sentence below, which belongs to that pair. */}
                      <div className="defrow">
                        <span className="label">Link Description</span>
                        <input
                          className="linkOwnDescription"
                          placeholder="what this relation means, in your words"
                          defaultValue={link.description}
                          onBlur={(e) => {
                            if (e.target.value !== link.description) {
                              editLink(link.id, { description: e.target.value })
                              flash("description saved")
                            }
                          }}
                        />
                      </div>
                      {edges.length === 0 && (
                        <p className="hint" style={{ marginTop: "8px" }}>
                          No thread uses this yet — it is yours to reach for.
                        </p>
                      )}
                      {edges.map((edge) => (
                        <div
                          key={edge.id}
                          style={{
                            marginTop: "12px",
                            borderBottom: "1px dotted var(--rule)",
                            paddingBottom: "8px",
                          }}
                        >
                          <div className="trip">
                            <b>{labelOf(edge.fromId)}</b>{" "}
                            <span className="vpill">{label}</span>{" "}
                            <b>{labelOf(edge.toId)}</b>
                          </div>
                          <div className="defrow" style={{ marginTop: "6px" }}>
                            <span className="label">Description</span>
                            <input
                              className="linkDescription"
                              placeholder="the sentence this thread reads as…"
                              defaultValue={edge.sentence}
                              onBlur={(e) => {
                                if (e.target.value !== edge.sentence) {
                                  editEdge(edge.id, { sentence: e.target.value })
                                  flash("description saved")
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {looseLinks.length > 0 && (
            <p className="ghostnote" style={{ marginTop: "10px" }}>
              {looseLinks.length} link{looseLinks.length !== 1 ? "s carry" : " carries"} a
              description but no label yet — label one on <b>02 · Linking</b> so a word can
              recur.
            </p>
          )}
        </div>
      </div>

      {/* The Concepts and Links Overlays (ruling 28) — **faculty and admins
          only** (TJ, 2026-08-08). Students never meet this; faculty do, here,
          because they hold their own learner surfaces alongside the faculty
          view. Below the holdings, not beside them: the comparison is a second
          look at words you already have. Re-checked server-side. */}
      {isStaff && (
        <VocabularyOverlay sourceId={soleSourceId(scope)} ownCaptureCount={scoped.passages.length} />
      )}
    </>
  )
}
