"use client"

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import type { Concept, Passage } from "@/lib/types"
import styles from "./AddConceptRailCard.module.css"

type AddConceptRailCardProps = {
  passage: Passage
  concepts: Concept[]
  onCreateConcept: (label: string, def?: string) => Promise<Concept>
  onAddConcept: (passageId: string, conceptId: string) => Promise<Passage>
  /**
   * Fill a reused Concept's empty Description. Optional so the card still
   * files without it; when it is absent a Description typed against an
   * existing label is simply not written, which is what the card did for
   * every match before.
   */
  onEditConcept?: (conceptId: string, data: { def: string }) => Promise<void>
  onClose: () => void
}

export default function AddConceptRailCard({
  passage,
  concepts,
  onCreateConcept,
  onAddConcept,
  onEditConcept,
  onClose,
}: AddConceptRailCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const autofilledDescription = useRef("")
  const inputId = useId()
  const listId = useId()
  const [label, setLabel] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const name = label.trim()
  const definition = description.trim()
  const exactConcept = name
    ? concepts.find(
        (concept) => concept.label.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
      )
    : undefined
  const alreadyFiled = !!exactConcept && passage.conceptIds.includes(exactConcept.id)
  const options = useMemo(
    () => [...concepts].sort((a, b) => a.label.localeCompare(b.label)),
    [concepts]
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if ((!name && !definition) || busy || alreadyFiled) return

    setBusy(true)
    setError("")
    try {
      const concept = exactConcept ?? await onCreateConcept(name, definition || undefined)
      /* Reuse writes the Description too. `definition` used to reach only the
         create branch, so a Description typed against an existing label was
         dropped on the floor while its field stayed enabled and said nothing —
         and under "either or both" (TJ, 2026-08-18) describing a Concept that
         has no Description yet is the ordinary act, not an edge case.
         Fill-if-empty, never overwrite, is the rule the other two doors into
         `addConcept` already keep: CaptureModal.tsx ("the gloss never
         overwrites what you wrote before") and OpenTab.tsx both do
         `else if (wdef && !concept.def) editConcept(...)`. An autofilled
         Description equals the stored one, so that case writes nothing. */
      if (exactConcept && definition && !exactConcept.def?.trim()) {
        await onEditConcept?.(exactConcept.id, { def: definition })
      }
      await onAddConcept(passage.id, concept.id)
      onClose()
    } catch {
      setError("Could not add. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={styles.card}
      aria-label="Add concept to passage"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <form onSubmit={submit}>
        <button
          type="button"
          className={styles.close}
          aria-label="Close add concept card"
          title="Close"
          onClick={onClose}
        >×</button>
        <fieldset>
          <legend>
            Add concept to passage <span>a short noun phrase</span>
          </legend>
          <div className={styles.row}>
            <div className={styles.inputs}>
            <input
                ref={inputRef}
                id={inputId}
                list={`${listId}-labels`}
                value={label}
                placeholder="label, e.g. boundary objects"
                aria-label="Concept label"
                autoComplete="off"
                title={alreadyFiled ? "Already on this passage" : undefined}
                onChange={(event) => {
                  const nextLabel = event.target.value
                  const nextName = nextLabel.trim()
                  /* An EMPTY field matches nothing. A Concept may carry a
                     Description and no Label (TJ, 2026-08-18: "a concept needs
                     either or both a description and a label"), so an unguarded
                     `find` on "" matched the FIRST label-less Concept and
                     borrowed its Description into a field the student had just
                     cleared to write their own. Observed on the running app at
                     1536: clearing the label filled the textarea with "something
                     about wizards i cant yet place." — another Concept's words.
                     The same guard is already on `exactConcept` above. */
                  const match = nextName
                    ? concepts.find(
                        (concept) => concept.label.trim().toLocaleLowerCase() === nextName.toLocaleLowerCase()
                      )
                    : undefined
                  /* Read and written OUT HERE, never inside the setState
                     updater below. React invokes updaters twice under
                     StrictMode — which Next's App Router turns on in
                     development, the only mode this card runs in — so a ref
                     written inside one is clobbered by the first pass and read
                     stale by the second. The clear branch then never fired:
                     measured on the running app, typing "confusion", deleting
                     it and typing a new label left the matched Concept's
                     Description in the field, and the POST coined the new
                     Concept carrying it. */
                  const previousAutofill = autofilledDescription.current
                  const nextAutofill = match?.def?.trim() ?? ""
                  autofilledDescription.current = nextAutofill
                  setLabel(nextLabel)
                  setDescription((current) => {
                    if (nextAutofill) return nextAutofill
                    return previousAutofill && current === previousAutofill ? "" : current
                  })
                  setError("")
                }}
              />
              <textarea
                id={`${inputId}-description`}
                value={description}
                placeholder="description, in your own words"
                aria-label="Concept description"
                rows={2}
                title={alreadyFiled ? "Already on this passage" : undefined}
                onChange={(event) => {
                  autofilledDescription.current = ""
                  setDescription(event.target.value)
                  setError("")
                }}
              />
            </div>
            <datalist id={`${listId}-labels`}>
              {options.filter((concept) => concept.label.trim()).map((concept) => (
                <option key={concept.id} value={concept.label} />
              ))}
            </datalist>
            <button type="submit" disabled={(!name && !definition) || busy || alreadyFiled}>
              {busy ? "adding…" : exactConcept ? "add to passage" : "create + add to passage"}
            </button>
          </div>
        </fieldset>
        {error ? <span className={styles.error} role="alert">{error}</span> : null}
      </form>
    </section>
  )
}
