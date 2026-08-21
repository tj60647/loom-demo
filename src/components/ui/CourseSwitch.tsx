"use client"

import { useEffect, useRef, useState } from "react"

import { setActiveCourse } from "@/actions/courses"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings, type ActiveCourse } from "@/components/providers/ReadingsProvider"

/**
 * The course label, and the switch it becomes when one person carries more
 * than one course.
 *
 * Whose syllabus this is, before whose account it is — context, not identity,
 * quieter than the name (the v14 ruling AuthButton carried; the span moved
 * here unchanged). When the account holds a second active enrolment the
 * context is a CHOICE, so the label is where the choice lives: same glyphs,
 * same ochre, plus an 8px caret — 12px against the header's 11-character
 * slack at the 1280 floor (Header.tsx's width note; the rejected
 * "full screen app" wrap cost ~32px).
 *
 * Who never sees the menu: single-course accounts (nothing to disambiguate —
 * TJ, 2026-08-21), Open Loom viewers and membership-less admins (the server
 * sends `courses: []` for both). The student lens does NOT hide it: the list
 * is the wearer's own enrolments, which is exactly what a real two-course
 * student sees.
 *
 * A switch is flush → stamp → FULL navigation, in that order; the pick
 * handler's comment says why the order is the design.
 */
export default function CourseSwitch({ course }: { course: ActiveCourse }) {
  const { flushCloth, flushMapText, flash } = useLoom()
  const { announceCourseSwitch } = useReadings()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const hostRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Escape closes and hands focus back; a pointer outside closes, on the
  // capture phase. HeaderMenu's contract verbatim — the header keeps one
  // dropdown behavior, not two.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown, true)
    }
  }, [open])

  // Tolerates a response cached from before the field existed.
  const courses = course.courses ?? []
  const labelText = `${course.name}${course.term ? ` · ${course.term}` : ""}`

  // One enrolment: the quiet ochre span exactly as it has always been.
  if (courses.length < 2) {
    return (
      <span className="label" style={{ color: "var(--ochre)" }}>
        {labelText}
      </span>
    )
  }

  const pick = async (id: string) => {
    setOpen(false)
    // Re-picking where you stand: close, nothing else — no re-stamp.
    if (id === course.id || busy) return
    setBusy(true)
    try {
      // THE ORDER IS THE DESIGN. Fire the debounced cloth/map writes NOW:
      // server actions from one client serialize (LoomProvider's own read/
      // write note relies on this), so they are stamped into the CURRENT
      // course before setActiveCourse runs — and LoomProvider's pagehide
      // flush then finds nothing left to send after the stamp. Navigating
      // first would do the opposite: the unload flush would carry the last
      // keystrokes into the NEW course.
      flushCloth()
      flushMapText()
      await setActiveCourse(id)
      // Every other tab hard-reloads out of the old course; the posting
      // channel never hears its own message, so this tab is not raced.
      announceCourseSwitch()
      // A FULL load, not a soft refresh: the workbench belongs to one course
      // at a time, and optimistic state, undo stacks and any timer still
      // pending die with the document. Land on the Library — where a student
      // starts, the same door the lens takes when it leaves /admin.
      window.location.assign("/")
    } catch {
      setBusy(false)
      flash("could not switch courses — try again")
    }
  }

  return (
    <span className="courseswitch" ref={hostRef}>
      <button
        ref={buttonRef}
        type="button"
        className="label courseswitch-btn"
        style={{ color: "var(--ochre)" }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-busy={busy || undefined}
        aria-label={`Course — ${labelText}. You are in ${courses.length} courses; switch`}
        data-tip="you are in more than one course — switch"
      >
        {labelText}
        <svg
          viewBox="0 0 8 8"
          width="8"
          height="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M1 2.5 L4 5.5 L7 2.5" />
        </svg>
      </button>
      {open && (
        <div className="headermenu-panel" role="menu" aria-label="Your courses">
          {/* menuitemradio, not menuitem: a menu of exclusive choices. The
              current row is marked three ways — ochre, the say-line suffix,
              aria-checked — and by id, never by position: the list keeps a
              stable order (createdAt) while selectedAt reorders the resolver. */}
          {courses.map((c) => {
            const current = c.id === course.id
            return (
              <button
                key={c.id}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                className="headermenu-item"
                style={current ? { color: "var(--ochre)" } : undefined}
                onClick={() => pick(c.id)}
              >
                {c.name}
                <span className="headermenu-say">
                  {c.term || "no term"}
                  {current ? " — you are here" : ""}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}
