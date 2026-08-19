"use client"

import { useState } from "react"

/**
 * NAME A CONCEPT BEFORE ITS EVIDENCE — one component, three homes.
 *
 * It lived only in Your work's concepts view until 2026-08-18, when TJ asked
 * for it "to be a component used in your work, the warp behind a '+' icon we
 * have been using for add a concept, and in vocabulary concepts". Those are
 * the three places a student looks at their concepts, and coining one ahead of
 * its evidence is the same act in all of them.
 *
 * A concept coined here joins NO reading. The model is explicit — §Concept: "A
 * Concept with no Passages therefore belongs to NO Reading, and is in scope
 * EVERYWHERE — it stands in every Reading's warp while the student hunts for
 * what backs it" — which is why the button names the VOCABULARY as its
 * destination from all three, and why the same component can sit in a
 * reading-scoped station without lying about where the concept lands.
 *
 * The prose above the fields says the same thing to the student, so the two
 * cannot drift: whichever station you coin from, it "stays in view in every
 * reading while you hunt".
 */
export default function NameConceptCard({
  listId,
  onAdd,
  onDone,
}: {
  /** The shared concept datalist. A PROP, never hardcoded — VocabularyTab and
   *  OpenTab declare different ids and both tabs are kept alive. */
  listId?: string
  /** Coin it. The host owns the homonym confirm, which differs by station. */
  onAdd: (label: string, def?: string) => Promise<void>
  /** Called after a successful add — the two `+` hosts close on it; Your work,
   *  where the form is always on screen, passes none. */
  onDone?: () => void
}) {
  const [label, setLabel] = useState("")
  const [def, setDef] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const name = label.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      await onAdd(name, def.trim() || undefined)
      setLabel("")
      setDef("")
      onDone?.()
    } finally {
      setBusy(false)
    }
  }

  return (
  <div className="aheadofit">
    <span className="label">Name a concept before its evidence</span>
    <p className="hint" style={{ marginTop: 2 }}>
      Expecting an idea before you have found it in the text? Name it, say what you
      think it is, and go looking. It shows as <b>no evidence</b> until a passage
      backs it — a state, not a fault — and it stays in view in every reading while
      you hunt.
    </p>
    <div className="form-row">
      {/* The explanation moves INTO the label and the placeholder becomes
          an example (TJ, 2026-08-17). It was the other way round: the
          field said "the concept you are looking for…", which is a
          sentence about the field rather than a picture of the answer,
          and the shape of a concept — a short noun phrase — was hidden in
          a `title` nobody hovers. Every other placeholder in Loom is an
          example ("ch. 3, p. 49", "your word… e.g. leads to").

          NOT marked "(optional)" yet, though the model allows it —
          §Concept: "Label [< 8 words, may be null at capture]". The
          button below is still disabled without one, and it has to be:
          an unnamed concept renders in 67 places that have no rule for
          what to show, so shipping the word before the display would
          make the form promise something the app cannot draw. That work
          is written up, with the "one or the other or both" constraint
          TJ added, which the model does not yet state. */}
      <span className="label">
        Concept{" "}
        <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--ochre)" }}>
          — a short noun phrase naming the idea
        </span>
      </span>
      <input
        list={listId}
        placeholder="e.g. boundary objects"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
    </div>
    <div className="form-row">
      <span className="label">
        Description{" "}
        <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
      </span>
      <input
        placeholder="what you take it to mean, in your own words"
        title="the reason you expect to find this — what you will read the candidate passage against"
        value={def}
        onChange={(e) => setDef(e.target.value)}
      />
    </div>
    {/* "add concept to VOCABULARY", not "to cloth" (TJ proposed the
        pair; the destination is the correction). A concept coined
        before its evidence joins nothing here: model §Concept — "A
        Concept with no Passages therefore belongs to NO Reading, and is
        in scope EVERYWHERE — it stands in every Reading's warp while the
        student hunts for what backs it" — and the Concept List "belongs
        to the User, spans Cloths". It enters THIS cloth the moment a
        passage here evidences it, which is what the two "add concept to
        passage" buttons above do.

        The paragraph directly over this input already says as much: "it
        stays in view in every reading while you hunt". A button reading
        "to cloth" would have contradicted its own instructions.

        Naming the destination on all three is the point: the same three
        words, three different objects, was the confusion TJ started
        from ("i dont know what this means, file this?").

        Disabled until there is a name, like Add passage above: the
        handler already returned early on an empty one, silently. */}
    <button
      className="btn ghost mini"
      onClick={submit}
      disabled={!label.trim() || busy}
    >{busy ? "adding…" : "add concept to vocabulary"}</button>
  </div>
  )
}
