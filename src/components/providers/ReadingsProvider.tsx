"use client"

// The course's readings, fetched once for the whole app.
//
// Reading-first puts a reading's name in a lot of places that used to show
// nothing — the shelf, the scope bar, "you've named this before, in Star
// (2010)". All of them want the same small list, and none of them should
// re-fetch it.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
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
}

const ReadingsContext = createContext<ReadingsContextValue | null>(null)

export function ReadingsProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [readings, setReadings] = useState<ReadingMeta[]>([])
  const [course, setCourse] = useState<ActiveCourse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    // Deferred rather than set synchronously, the way LoomProvider does it: a
    // setState in an effect body cascades renders.
    if (!session) {
      const clear = window.setTimeout(() => {
        setReadings([])
        setCourse(null)
        setIsLoading(false)
      }, 0)
      return () => window.clearTimeout(clear)
    }
    let live = true
    const start = window.setTimeout(() => setIsLoading(true), 0)
    getSources()
      .then((rows) => {
        if (live) {
          setReadings(rows as ReadingMeta[])
          setError(null)
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Failed to load your readings")
      })
      .finally(() => {
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
    }
  }, [readings, course, isLoading, error])

  return <ReadingsContext.Provider value={value}>{children}</ReadingsContext.Provider>
}

export function useReadings() {
  const context = useContext(ReadingsContext)
  if (!context) throw new Error("useReadings must be used within a ReadingsProvider")
  return context
}
