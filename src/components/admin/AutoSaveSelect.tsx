"use client"

/**
 * A select that saves on change. A pick + a confirm button read as two
 * decisions when they are one (TJ, 2026-08-20, the roster's section
 * assignment; 2026-08-21 extended it to role): choosing IS the decision,
 * so the choice submits the form it sits in — the same server action the
 * button used to fire, nothing else changed. Only for reversible moves:
 * the same control undoes what it did. Anything irreversible wants
 * useDialog().confirm, not this.
 */
export default function AutoSaveSelect({
  name,
  defaultValue,
  ariaLabel,
  title,
  emptyLabel,
  options,
}: {
  name: string
  defaultValue: string
  ariaLabel: string
  title?: string
  /** Renders a leading "" option when set — the unassigned state. */
  emptyLabel?: string
  options: { value: string; label: string }[]
}) {
  return (
    <select
      name={name}
      className="tinput inline"
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      title={title}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
