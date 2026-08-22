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
      // Keyed by the server's value, or the pick does not stick (TJ,
      // 2026-08-22: "why dont the section dopdowns 'stick' to the
      // selection? if i refresh they appear, but when i make the selection
      // they do not"). React resets an uncontrolled form after its action
      // resolves, which restores this select to the defaultValue it was
      // MOUNTED with; the fresh value then arrives as a prop, but React
      // will not overwrite an uncontrolled element's live value, so the row
      // kept showing the old section until a reload. Walked on the running
      // app: picking Green on Test User A wrote Green and displayed
      // "Section 1" until refresh. A changed key remounts the element onto
      // the new value. Held here rather than at the call sites so no future
      // one has to remember — the same trap as the courses page's lead
      // select (src/app/admin/courses/page.tsx, key={leadDefault}).
      key={defaultValue}
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
