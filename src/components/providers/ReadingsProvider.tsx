"use client"

// The course's readings, fetched once for the whole app.
//
// Reading-first puts a reading's name in a lot of places that used to show
// nothing — the shelf, the scope bar, "you've named this before, in Star
// (2010)". All of them want the same small list, and none of them should
// re-fetch it.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { getSources } from "@/actions/sources"
import { getActiveCourse } from "@/actions/courses"
import { frontendReadings } from "@/lib/frontendFixture"

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
  /** A front-end-only stand-in for the source text, used while designing the reading workspace. */
  isPreview?: boolean
}

/** The course these readings belong to — null before it loads, or if none. */
export type ActiveCourse = { id: string; name: string; term: string }

type ReadingsContextValue = {
  readings: ReadingMeta[]
  byId: Map<string, ReadingMeta>
  /** The course whose syllabus this is; the header names it. */
  course: ActiveCourse | null
  isLoading: boolean
  error: string | null
  /** StageIt supplies fixture rows and never calls reading actions. */
  frontendOnly: boolean
  /** The four most recently added readings, retained across routes. */
  openReadings: ReadingMeta[]
  selectReading: (sourceId: string) => void
  closeReading: (sourceId: string) => void
  /** A reading's title, or a plain fallback — never a bare id. */
  titleOf: (sourceId: string | null | undefined) => string
  /** Re-read the shelf, e.g. after the student adds a reading of their own. */
  refresh: () => void
}

const ReadingsContext = createContext<ReadingsContextValue | null>(null)
const OPEN_READINGS_KEY = "loom_open_readings"
const LEGACY_CURRENT_READING_KEY = "loom_current_reading"
export const OPEN_READING_LIMIT = 4

export function ReadingsProvider({ children, frontendOnly = false }: { children: ReactNode; frontendOnly?: boolean }) {
  const { data: session } = useSession()
  const pathname = usePathname() ?? ""
  const routeReadingId = pathname.match(/^\/studio\/reading\/([^/]+)/)?.[1]
  const [readings, setReadings] = useState<ReadingMeta[]>(() => frontendOnly ? frontendReadings : [])
  const [course, setCourse] = useState<ActiveCourse | null>(() => frontendOnly ? { id: "stageit", name: "Loom interface", term: "frontend-only" } : null)
  const [isLoading, setIsLoading] = useState(!frontendOnly)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [openReadingIds, setOpenReadingIds] = useState<string[]>([])
  const openReadingIdsRef = useRef<string[]>([])
  const closedRouteIdRef = useRef<string | null>(null)

  const selectReading = useCallback((sourceId: string) => {
    if (openReadingIdsRef.current.includes(sourceId)) return
    const next = [sourceId, ...openReadingIdsRef.current].slice(0, OPEN_READING_LIMIT)
    openReadingIdsRef.current = next
    localStorage.setItem(OPEN_READINGS_KEY, JSON.stringify(next))
    setOpenReadingIds(next)
  }, [])

  const closeReading = useCallback((sourceId: string) => {
    const next = openReadingIdsRef.current.filter((id) => id !== sourceId)
    closedRouteIdRef.current = sourceId
    openReadingIdsRef.current = next
    localStorage.setItem(OPEN_READINGS_KEY, JSON.stringify(next))
    setOpenReadingIds(next)
  }, [])

  useEffect(() => {
    const load = window.setTimeout(() => {
      let restored: string[] = []
      try {
        const saved = localStorage.getItem(OPEN_READINGS_KEY)
        const stored = saved ? JSON.parse(saved) : null
        if (Array.isArray(stored)) {
          restored = stored.filter((id): id is string => typeof id === "string").slice(0, OPEN_READING_LIMIT)
        } else {
          const legacy = localStorage.getItem(LEGACY_CURRENT_READING_KEY)
          if (legacy) restored = [legacy]
        }
      } catch {
        const legacy = localStorage.getItem(LEGACY_CURRENT_READING_KEY)
        if (legacy) restored = [legacy]
      }
      openReadingIdsRef.current = restored
      setOpenReadingIds(restored)
    }, 0)
    return () => window.clearTimeout(load)
  }, [])

  useEffect(() => {
    if (!routeReadingId) {
      closedRouteIdRef.current = null
      return
    }
    if (routeReadingId === closedRouteIdRef.current || openReadingIds.includes(routeReadingId)) return
    closedRouteIdRef.current = null
    const remember = window.setTimeout(() => selectReading(routeReadingId), 0)
    return () => window.clearTimeout(remember)
  }, [routeReadingId, openReadingIds, selectReading])

  useEffect(() => {
    if (frontendOnly) {
      return
    }
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
  }, [frontendOnly, session, nonce])

  const value = useMemo<ReadingsContextValue>(() => {
    const byId = new Map(readings.map((r) => [r.id, r]))
    return {
      readings,
      byId,
      course,
      isLoading,
      error,
      frontendOnly,
      openReadings: openReadingIds.flatMap((id) => byId.get(id) ?? []),
      selectReading,
      closeReading,
      titleOf: (sourceId) => (sourceId && byId.get(sourceId)?.title) || "another reading",
      refresh: () => setNonce((n) => n + 1),
    }
  }, [readings, course, isLoading, error, frontendOnly, openReadingIds, selectReading, closeReading])

  return <ReadingsContext.Provider value={value}>{children}</ReadingsContext.Provider>
}

export function useReadings() {
  const context = useContext(ReadingsContext)
  if (!context) throw new Error("useReadings must be used within a ReadingsProvider")
  return context
}
