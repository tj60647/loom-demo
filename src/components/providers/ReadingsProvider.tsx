"use client"

// The course's readings, fetched once for the whole app.
//
// Reading-first puts a reading's name in a lot of places that used to show
// nothing — the shelf, the scope bar, "you've named this before, in Star
// (2010)". All of them want the same small list, and none of them should
// re-fetch it.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { getSources } from "@/actions/sources"

export type ReadingMeta = {
  id: string
  title: string
  author: string | null
  sourceReference: string | null
  description: string | null
  isDescriptionVisible: boolean
  week: number | null
}

type ReadingsContextValue = {
  readings: ReadingMeta[]
  byId: Map<string, ReadingMeta>
  isLoading: boolean
  error: string | null
  /** A reading's title, or a plain fallback — never a bare id. */
  titleOf: (sourceId: string | null | undefined) => string
}

const ReadingsContext = createContext<ReadingsContextValue | null>(null)

export function ReadingsProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [readings, setReadings] = useState<ReadingMeta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Deferred rather than set synchronously, the way LoomProvider does it: a
    // setState in an effect body cascades renders.
    if (!session) {
      const clear = window.setTimeout(() => {
        setReadings([])
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
        if (live) setError(e instanceof Error ? e.message : "Failed to load the shelf")
      })
      .finally(() => {
        if (live) setIsLoading(false)
      })
    return () => {
      live = false
      window.clearTimeout(start)
    }
  }, [session])

  const value = useMemo<ReadingsContextValue>(() => {
    const byId = new Map(readings.map((r) => [r.id, r]))
    return {
      readings,
      byId,
      isLoading,
      error,
      titleOf: (sourceId) => (sourceId && byId.get(sourceId)?.title) || "another reading",
    }
  }, [readings, isLoading, error])

  return <ReadingsContext.Provider value={value}>{children}</ReadingsContext.Provider>
}

export function useReadings() {
  const context = useContext(ReadingsContext)
  if (!context) throw new Error("useReadings must be used within a ReadingsProvider")
  return context
}
