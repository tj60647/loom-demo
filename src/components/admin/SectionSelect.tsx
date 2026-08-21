"use client"

/**
 * A section picker that saves on change. The select + "Assign"/"Place"
 * two-step read as two decisions when it is one (TJ, 2026-08-20): picking
 * the section IS the decision, so the pick submits the form it sits in —
 * the same server action the button used to fire, nothing else changed.
 * The move is reversible by the same control, which is what makes
 * save-on-change safe here.
 */
export default function SectionSelect({
  name,
  defaultValue,
  ariaLabel,
  emptyLabel,
  options,
}: {
  name: string
  defaultValue: string
  ariaLabel: string
  emptyLabel: string
  options: { id: string; name: string }[]
}) {
  return (
    <select
      name={name}
      className="tinput inline"
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  )
}
