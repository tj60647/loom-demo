// Client-side reads.
//
// Every function here is a GET against a thin route handler that calls the
// server-side read of the same name in src/actions/*. Client components import
// reads from HERE, never from "@/actions/*": a Server Function invoked from
// the client is dispatched through the App Router's action queue as a POST to
// whatever route the router believes it is on, and a queued read racing a
// <Link> navigation corrupts that belief — the queue's canonical URL is left
// on the old route, and the next action's POST is answered with the old page,
// which replaces the screen the student is standing in mid-work (the shelf
// bounce; vercel/next.js#90467, measured by scripts/repro-action-bounce.mjs).
// Route handlers do not participate in client-side navigation, so a read made
// here cannot move the router — and reads run in parallel instead of queueing
// behind one another, which the Next docs ask of data fetching anyway.
//
// Mutations stay Server Functions in src/actions/* — that is their sanctioned
// use. Signatures and return shapes here mirror the actions exactly, so a
// call site changes only its import line.
//
// JSON strips Date instances to strings; the revivers below put them back so
// the shapes in src/lib/types keep telling the truth.

import type { LoomState, GraphEvent } from "@/lib/types"
import type { ActiveCourse, ReadingMeta } from "@/components/providers/ReadingsProvider"
import type { ReadingSearchHit, LoomSearchResult, ReadingPageSearch } from "@/actions/search"
import type { OverlayBand, PassagesOverlay, VocabularyOverlay } from "@/lib/overlay"
import type { MetadataDraft } from "@/lib/metadataDraft"
import type { getRepairSettings as getRepairSettingsAction } from "@/actions/repairs"

async function readJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // A bodyless failure still throws below, just with the generic message.
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Could not read just now (${res.status})`
    // "Unauthorized" survives verbatim: LoomProvider's resync tells an auth
    // failure apart from a save failure by exactly this message.
    throw new Error(message)
  }
  return body as T
}

const asDate = (value: Date | string): Date => new Date(value)

function reviveLoomState(raw: LoomState): LoomState {
  return {
    ...raw,
    concepts: raw.concepts.map((c) => ({ ...c, createdAt: asDate(c.createdAt) })),
    bytes: raw.bytes.map((b) => ({ ...b, createdAt: asDate(b.createdAt) })),
    edges: raw.edges.map((e) => ({ ...e, createdAt: asDate(e.createdAt) })),
    maps: raw.maps.map((m) => ({ ...m, createdAt: asDate(m.createdAt), updatedAt: asDate(m.updatedAt) })),
    cloths: raw.cloths.map((c) => ({ ...c, createdAt: asDate(c.createdAt), updatedAt: asDate(c.updatedAt) })),
  }
}

/** The student's whole loom — see getUserLoomData in src/actions/loom.ts. */
export async function getUserLoomData(): Promise<LoomState> {
  return reviveLoomState(await readJson<LoomState>("/api/loom"))
}

/** The capture log — see getGraphEvents in src/actions/loom.ts. */
export async function getGraphEvents(): Promise<GraphEvent[]> {
  const events = await readJson<GraphEvent[]>("/api/loom/events")
  return events.map((e) => ({ ...e, at: asDate(e.at) }))
}

/** The caller's shelf — see getSources in src/actions/sources.ts. */
export function getSources(): Promise<ReadingMeta[]> {
  return readJson<ReadingMeta[]>("/api/sources")
}

/** The course the header names — see getActiveCourse in src/actions/courses.ts. */
export function getActiveCourse(): Promise<ActiveCourse | null> {
  return readJson<ActiveCourse | null>("/api/course")
}

/** Search the shelf's readings — see searchReadings in src/actions/search.ts. */
export function searchReadings(rawQuery: string): Promise<ReadingSearchHit[]> {
  return readJson<ReadingSearchHit[]>(`/api/search/readings?q=${encodeURIComponent(rawQuery)}`)
}

/** Search the student's own holdings — see searchLoom in src/actions/search.ts. */
export function searchLoom(rawQuery: string): Promise<LoomSearchResult> {
  return readJson<LoomSearchResult>(`/api/search/loom?q=${encodeURIComponent(rawQuery)}`)
}

/** Search inside one reading — see searchReading in src/actions/search.ts. */
export function searchReading(sourceId: string, rawQuery: string): Promise<ReadingPageSearch> {
  return readJson<ReadingPageSearch>(
    `/api/search/reading?sourceId=${encodeURIComponent(sourceId)}&q=${encodeURIComponent(rawQuery)}`
  )
}

/** Peer passage heat for a reading — see getPassagesOverlay in src/actions/overlays.ts. */
export function getPassagesOverlay(sourceId: string, band: OverlayBand = "section"): Promise<PassagesOverlay> {
  return readJson<PassagesOverlay>(
    `/api/overlays/passages?sourceId=${encodeURIComponent(sourceId)}&band=${band}`
  )
}

/** What others named — see getVocabularyOverlay in src/actions/overlays.ts. */
export function getVocabularyOverlay(
  sourceId: string | null,
  band: OverlayBand = "section"
): Promise<VocabularyOverlay> {
  const scope = sourceId ? `sourceId=${encodeURIComponent(sourceId)}&` : ""
  return readJson<VocabularyOverlay>(`/api/overlays/vocabulary?${scope}band=${band}`)
}

type RepairSettings = Awaited<ReturnType<typeof getRepairSettingsAction>>

/** The repair panel's reader roster — see getRepairSettings in src/actions/repairs.ts. */
export function getRepairSettings(): Promise<RepairSettings> {
  return readJson<RepairSettings>("/api/repairs/settings")
}

/** Draft card metadata off a library PDF — see draftMetadataForSource in src/actions/sources.ts. */
export function draftMetadataForSource(sourceId: string): Promise<MetadataDraft> {
  return readJson<MetadataDraft>(`/api/draft-metadata?sourceId=${encodeURIComponent(sourceId)}`)
}

/** The same draft for a student's own reading — see draftMetadataForOwnSource. */
export function draftMetadataForOwnSource(sourceId: string): Promise<MetadataDraft> {
  return readJson<MetadataDraft>(`/api/draft-metadata/own?sourceId=${encodeURIComponent(sourceId)}`)
}
