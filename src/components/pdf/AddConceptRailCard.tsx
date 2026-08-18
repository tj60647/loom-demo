"use client"

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import type { Concept, Passage } from "@/lib/types"
import styles from "./AddConceptRailCard.module.css"

type AddConceptRailCardProps = {
  passage: Passage
  concepts: Concept[]
  onCreateConcept: (label: string, def?: string) => Promise<Concept>
  onAddConcept: (passageId: string, conceptId: string) => Promise<Passage>
  onClose: () => void
}

export default function AddConceptRailCard({
  passage,
  concepts,
  onCreateConcept,
  onAddConcept,
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
                  const match = concepts.find(
                    (concept) => concept.label.trim().toLocaleLowerCase() === nextLabel.trim().toLocaleLowerCase()
                  )
                  setLabel(nextLabel)
                  setDescription((current) => {
                    const previousAutofill = autofilledDescription.current
                    const nextAutofill = match?.def?.trim() ?? ""
                    autofilledDescription.current = nextAutofill
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
