"use client"

// The course's readings, fetched once for the whole app.
//
// Reading-first puts a reading's name in a lot of places that used to show
// nothing — the shelf, the scope bar, "you've named this before, in Star
// (2010)". All of them want the same small list, and none of them should
// re-fetch it.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { getSources, getActiveCourse } from "@/lib/reads"

export type ReadingMeta = {
  id: string
  title: string
  author: string | null
  sourceReference: string | null
  description: string | null
  isDescriptionVisible: boolean
  week: number | null
  /** A card the student minted for themselves; on nobody else's shelf. */
  isOwn: boolean
  /**
   * Core or supplemental, per the syllabus. A fact about the reading in THIS
   * course — it lives on `course_source`, not on the reading — so a text can
   * be core in one course and supplemental in another. Always false for an
   * own reading, which is neither.
   */
  isCore: boolean
  /** Null when the card is reference-only — a citation with no PDF behind it. */
  storageKey: string | null
}

/** The course these readings belong to — null before it loads, or if none. */
export type ActiveCourse = {
  id: string
  name: string
  term: string
  /** Faculty of this course, or a site admin. Decides whether the Overlay
   *  controls are drawn at all — students never see them (TJ, 2026-08-08).
   *  Not an authorization: the overlay actions re-check server-side. */
  isStaff: boolean
  /** A SITE admin, who also holds the write surfaces (Readings, Courses).
   *  Faculty are staff but not admin — the journey bar grades the staff group
   *  by this (TJ, 2026-08-09). Not an authorization; every page re-gates. */
  isAdmin: boolean
  /**
   * Staff REGARDLESS of the student lens — the one field that must not be
   * masked, because it is what draws the control for taking the lens off.
   * Use this for nothing else: every "should this be drawn?" question is
   * `isStaff` / `isAdmin` above, which the lens does mask.
   */
  staffTruly: boolean
  /** The student lens is on. See src/lib/viewAs.ts. */
  viewingAsStudent: boolean
  /** The course's sections, for the Overlay picker. Empty for a student. */
  sections: { id: string; name: string }[]
  /** Every enrolment this person could make the working course — their own
   *  active memberships in unarchived courses, stable order (createdAt then
   *  id, so rows do not jump after a switch; the current one is marked by
   *  id, never by position). Empty while Open Loom viewing is on (the course
   *  above is the STUDENT's) and for an admin with no membership (AdminNav's
   *  ?course= picker is theirs). NOT masked by the student lens — these are
   *  the wearer's own enrolments. The header label is a control only when
   *  this holds more than one. */
  courses: { id: string; name: string; term: string }[]
}

type ReadingsContextValue = {
  readings: ReadingMeta[]
  byId: Map<string, ReadingMeta>
  /** The course whose syllabus this is; the header names it. */
  course: ActiveCourse | null
  isLoading: boolean
  error: string | null
  /** A reading's title, or a plain fallback — never a bare id. */
  titleOf: (sourceId: string | null | undefined) => string
  /** Re-read the shelf, e.g. after the student adds a reading of their own. */
  refresh: () => void
  /**
   * Re-read the syllabus IF it is old enough to be worth re-reading. Quiet:
   * unlike `refresh` it never shows a loading state, so a reader arriving at
   * the Library does not see the shelf blink. Call it on arrival; the floor
   * below decides whether anything happens.
   */
  revalidateIfStale: () => void
}

/**
 * How stale the syllabus may be before arriving at the Library re-reads it.
 * Long enough that stepping in and out of a reading costs no queries; short
 * enough that someone coming back from the admin screens is not looking at a
 * syllabus from before their own edit.
 */
const REREAD_AFTER_MS = 30_000

const ReadingsContext = createContext<ReadingsContextValue | null>(null)

export function ReadingsProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [readings, setReadings] = useState<ReadingMeta[]>([])
  const [course, setCourse] = useState<ActiveCourse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  /**
   * When the list was last read SUCCESSFULLY — the staleness floor measures
   * from this, so a failed read does not buy itself a quiet window.
   *
   * 0 means no successful read yet, and `revalidateIfStale` treats it as
   * "nothing to revalidate" rather than as infinitely stale. That matters
   * because React runs child effects before parent ones: the Shelf's arrival
   * call fires BEFORE this provider's own first read, and without the sentinel
   * every cold load would fetch the list twice.
   */
  const lastReadRef = useRef(0)
  /** A read is in flight; stops two callers starting overlapping fetches. */
  const inFlightRef = useRef(false)
  /** Something has been shown at least once, so a re-read need not announce
   *  itself as loading. */
  const hasDataRef = useRef(false)
  /** The last `nonce` this effect acted on, so a deliberate `refresh()` can be
   *  told apart from the session object merely being replaced. */
  const lastNonceRef = useRef(0)

  useEffect(() => {
    // Deferred rather than set synchronously, the way LoomProvider does it: a
    // setState in an effect body cascades renders.
    if (!session) {
      const clear = window.setTimeout(() => {
        setReadings([])
        setCourse(null)
        setIsLoading(false)
      }, 0)
      // The refs go back to their starting state with the data. They describe
      // a list that no longer exists, and carrying them across a sign-out
      // would tell the NEXT person's first read that the shelf is fresh.
      hasDataRef.current = false
      lastReadRef.current = 0
      inFlightRef.current = false
      return () => window.clearTimeout(clear)
    }
    // This effect re-runs on every session change, and next-auth refetches the
    // session whenever the tab comes back to the front — SessionProvider's own
    // visibilitychange listener, `refetchOnWindowFocus` defaulting to true —
    // handing back a new object each time whether or not anything changed. So
    // "the session changed" is not by itself a reason to re-read the syllabus,
    // and without this floor every return to the tab spent a query.
    //
    // Safe against a genuine change of person because signing out clears the
    // refs above: a new sign-in always has hasData false and reads.
    //
    // `refresh()` is exempt, and must be. It is the loud path a reader takes
    // after doing something themselves — taking one of their own readings off
    // the shelf — and a floor that swallowed it would leave the card sitting
    // there looking like the removal had failed.
    const forced = nonce !== lastNonceRef.current
    lastNonceRef.current = nonce
    // Someone else is already reading. React runs child effects before parent
    // ones, so on a session change the Shelf's arrival call gets here first and
    // starts the read; without this the floor would pass for both of them and
    // the same list would be fetched twice on every return to the tab. Caught
    // by the read-count assertion in tests/shelf-refetch.spec.ts, which is what
    // that assertion is for.
    if (!forced && inFlightRef.current) return
    if (!forced && hasDataRef.current && Date.now() - lastReadRef.current < REREAD_AFTER_MS) return

    let live = true
    // Announce loading only when there is nothing on screen yet, so a re-read
    // does not blink the shelf back to its loading state.
    const start = window.setTimeout(() => {
      if (!hasDataRef.current) setIsLoading(true)
    }, 0)
    inFlightRef.current = true
    getSources()
      .then((rows) => {
        lastReadRef.current = Date.now()
        hasDataRef.current = true
        if (live) {
          setReadings(rows as ReadingMeta[])
          setError(null)
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Failed to load your readings")
      })
      .finally(() => {
        inFlightRef.current = false
        if (live) setIsLoading(false)
      })
    // The course label is decoration on a header that must not fail because of
    // it — a failed lookup just leaves the header unlabelled.
    getActiveCourse()
      .then((c) => { if (live) setCourse(c) })
      .catch(() => { if (live) setCourse(null) })
    return () => {
      live = false
      window.clearTimeout(start)
    }
  }, [session, nonce])

  /**
   * Re-read on arrival, if the list has gone stale.
   *
   * The effect above runs once per page load and on each session change. That
   * covers returning to the tab — next-auth refetches the session on
   * visibilitychange, which changes the session object and re-runs it — but it
   * does NOT cover arriving at the Library by an ordinary in-app navigation,
   * because nothing about the session changes and the provider never unmounts.
   *
   * That is the case this exists for, and the one that was reported on
   * 2026-09-07: an admin removed a reading from a course, moved from the admin
   * screens to the Library in the same tab, and the removed reading was still
   * listed. `revalidatePath("/")` cannot help — `/` renders a client
   * component, so there is no server-rendered list to invalidate.
   *
   * Quiet, rate-limited and silent on failure: it must not blink the shelf,
   * stepping in and out of a reading must not be a query each time, and a
   * background read that fails must leave the good list alone rather than
   * replace a working shelf with an error the reader did not cause.
   */
  const revalidateIfStale = useCallback(() => {
    if (!session) return
    if (inFlightRef.current) return
    // No successful read yet: the provider's own first read is in flight or
    // about to be, and there is nothing here to revalidate. The cost is that a
    // first read which FAILED is not retried on arrival — the reader sees the
    // error and reloads, as they did before this existed.
    if (lastReadRef.current === 0) return
    if (Date.now() - lastReadRef.current < REREAD_AFTER_MS) return
    inFlightRef.current = true
    getSources()
      .then((rows) => {
        lastReadRef.current = Date.now()
        hasDataRef.current = true
        setReadings(rows as ReadingMeta[])
        setError(null)
      })
      .catch(() => {
        // Left unsurfaced, and the timestamp left alone so the next arrival
        // tries again.
      })
      .finally(() => {
        inFlightRef.current = false
      })
    getActiveCourse()
      .then((c) => setCourse(c))
      // Unlike the first read, this does NOT blank the label on failure. There
      // the label is absent and there is nothing to keep; here a good one is
      // already on screen, and a failed background lookup is not a reason to
      // take it away.
      .catch(() => { /* keep the label we have */ })
  }, [session])

  const value = useMemo<ReadingsContextValue>(() => {
    const byId = new Map(readings.map((r) => [r.id, r]))
    return {
      readings,
      byId,
      course,
      isLoading,
      error,
      titleOf: (sourceId) => (sourceId && byId.get(sourceId)?.title) || "another reading",
      refresh: () => setNonce((n) => n + 1),
      revalidateIfStale,
    }
  }, [readings, course, isLoading, error, revalidateIfStale])

  return <ReadingsContext.Provider value={value}>{children}</ReadingsContext.Provider>
}

export function useReadings() {
  const context = useContext(ReadingsContext)
  if (!context) throw new Error("useReadings must be used within a ReadingsProvider")
  return context
}
