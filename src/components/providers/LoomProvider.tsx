"use client"

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react"
import { useSession } from "next-auth/react"
import { useParams } from "next/navigation"
import type { Byte, CardTableView, Cloth, Concept, Edge, LoomMap, LoomState, LoomViews, Tier } from "@/lib/types"
import { asLoomState, scopeOf, scopedGraph, soleSourceId, WHOLE_WEAVE, type Scope, type ScopedGraph } from "@/lib/scope"
import { emptyViews, parseImport, type ParsedMapImport } from "@/lib/graphExport"
import { getUserLoomData } from "@/lib/reads"
import {
  createConcept, updateConcept, deleteConcept, mergeConcepts as mergeConceptsAction,
  createByte, deleteByte, refileByte as refileByteAction, unfileByte as unfileByteAction, attributeBytes as attributeBytesAction,
  createEdge, updateEdge, deleteEdge,
  saveView, saveCloth as saveClothAction,
  createMap as createMapAction, updateMap as updateMapAction, deleteMap as deleteMapAction,
  importGraph, importMapArrangement, resetGraph, loadWorkedExample,
} from "@/actions/loom"

interface LoomContextType {
  /**
   * The WHOLE graph, always. Export, import and reset work on this — the
   * artifact is never a slice (red line #5).
   */
  state: LoomState
  /**
   * The reading the student is working in, read off the route. `WHOLE_WEAVE`
   * everywhere except `/reading/[sourceId]`.
   */
  scope: Scope
  /** The graph seen through `scope`, plus its bridges — derived, never stored. */
  scoped: ScopedGraph
  /** `scoped` in the shape the tabs consume, so they can swap it for `state`. */
  scopedState: LoomState
  isLoading: boolean
  /** Signed-in student's display name — graph.student in the export contract. */
  studentName: string
  addConcept: (label: string, def?: string, note?: string) => Promise<Concept>
  editConcept: (id: string, data: Partial<{label: string, def: string, note: string}>) => Promise<void>
  removeConcept: (id: string) => Promise<void>
  /** Merge source into target: pointers and threads repoint, source goes (ruling 36). */
  mergeConcepts: (sourceId: string, targetId: string) => Promise<void>
  /** Capture a passage. Zero concept ids is a legal capture — an Unlabeled Passage. */
  addByte: (conceptIds: string[], source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, sourceId?: string, pageContentHash?: string) => Promise<Byte>
  removeByte: (id: string) => Promise<void>
  /** Say which reading passages came from — the student's answer, never a guess. */
  attributeBytes: (byteIds: string[], sourceId: string) => Promise<number>
  /** File a passage under another concept — adds a pointer, never copies the byte. */
  refileByte: (byteId: string, conceptId: string) => Promise<Byte>
  /** Remove one concept pointer from a passage — the byte itself survives. */
  unfileByte: (byteId: string, conceptId: string) => Promise<void>
  /** The current scope's cloth (title + description), or null before one is written. */
  activeCloth: Cloth | null
  /**
   * Title or describe a cloth — the current scope's by default, or an explicit
   * scope's (the shelf creates a reading's cloth from the whole-weave scope).
   * Resolves true on save, false when the write failed and state was resynced.
   */
  updateCloth: (data: Partial<{ title: string; description: string }>, scopeKey?: string) => Promise<boolean>
  addEdge: (fromId: string, toId: string, sentence: string) => Promise<Edge>
  editEdge: (id: string, data: Partial<{handle: string, sentence: string}>) => Promise<void>
  removeEdge: (id: string) => Promise<void>
  /** All of the student's maps, capture order. */
  maps: LoomMap[]
  /** Maps whose scopeKey is the current scope's, capture order. */
  scopeMaps: LoomMap[]
  /**
   * The map being worked on in this scope: the student's pick, else the most
   * recently updated, else null when the scope has no map yet.
   */
  activeMap: LoomMap | null
  selectMap: (id: string) => void
  /** Create a map in the current scope (default name "Map N") and select it. */
  addMap: (name?: string) => Promise<LoomMap>
  renameMap: (id: string, name: string) => void
  removeMap: (id: string) => Promise<void>
  /** Replace a map's whole tier record (one write — "make all primary" included). */
  setMapTiers: (id: string, tiers: Record<string, Tier>) => Promise<void>
  setMapRead: (id: string, read: string) => void
  setMapEssence: (id: string, essence: string) => void
  /** Push pending debounced map text (name/read/essence) saves immediately (blur). */
  flushMapText: () => void
  /** Persist a student gesture on a view's geometry, keyed 'cardTable' | 'map:<id>'. */
  setView: (key: string, next: CardTableView) => void
  /**
   * The active map, creating "Map N" first when the scope has none — so the
   * first tier chip / drag / keystroke in a fresh scope just works. The create
   * is itself a student gesture's consequence, and it is flashed.
   */
  ensureActiveMap: () => Promise<LoomMap>
  importFromText: (raw: string) => Promise<void>
  /**
   * Add one map file as a new parallel sibling — nothing replaced. Tiers and
   * geometry land on the cards still on the table; the count that did not
   * resolve comes back for the caller to report.
   */
  importMapFile: (parsed: ParsedMapImport) => Promise<{ skipped: number }>
  resetAll: () => Promise<void>
  loadExample: () => Promise<void>
  /** Transient status line (v14's saveDot): '· saved ·', '· copied ·', errors. */
  flashMsg: string | null
  flash: (msg: string) => void
  undoStack: {edgeId: string, from: string | null, to: string | null}[]
  setUndoStack: React.Dispatch<React.SetStateAction<{edgeId: string, from: string | null, to: string | null}[]>>
  redoStack: {edgeId: string, from: string | null, to: string | null}[]
  setRedoStack: React.Dispatch<React.SetStateAction<{edgeId: string, from: string | null, to: string | null}[]>>
}

const LoomContext = createContext<LoomContextType | null>(null)

const blankState = (): LoomState => ({ concepts: [], bytes: [], edges: [], maps: [], cloths: [], views: emptyViews() })

export function LoomProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [state, setState] = useState<LoomState>(blankState())
  const [isLoading, setIsLoading] = useState(true)
  const [flashMsg, setFlashMsg] = useState<string | null>(null)

  const [undoStack, setUndoStack] = useState<{edgeId: string, from: string | null, to: string | null}[]>([])
  const [redoStack, setRedoStack] = useState<{edgeId: string, from: string | null, to: string | null}[]>([])

  // Scope comes from the URL, not from state a gesture has to set: `/reading/x`
  // IS the act of working in that reading, so there is no window where the app
  // has rendered against the wrong one. Everywhere else is the whole weave.
  const params = useParams<{ sourceId?: string }>()
  const routeSourceId = typeof params?.sourceId === "string" ? params.sourceId : null
  const scope = useMemo(
    () => (routeSourceId ? scopeOf([routeSourceId]) : WHOLE_WEAVE),
    [routeSourceId]
  )
  const scoped = useMemo(() => scopedGraph(state, scope), [state, scope])
  const scopedState = useMemo(() => asLoomState(state, scoped), [state, scoped])

  // Which map the student is working on, per scope. Client state only: it is a
  // cursor, not an artifact. A dangling id (deleted map) falls through to the
  // most-recently-updated default.
  const [selectedByScope, setSelectedByScope] = useState<Record<string, string>>({})
  const scopeMaps = useMemo(
    () => state.maps.filter((m) => m.scopeKey === scope.key),
    [state.maps, scope.key]
  )
  const activeMap = useMemo(() => {
    const chosen = scopeMaps.find((m) => m.id === selectedByScope[scope.key])
    if (chosen) return chosen
    if (!scopeMaps.length) return null
    return [...scopeMaps].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
  }, [scopeMaps, selectedByScope, scope.key])

  // The current scope's cloth — its title and description, when written.
  const activeCloth = useMemo(
    () => state.cloths.find((c) => c.scopeKey === scope.key) ?? null,
    [state.cloths, scope.key]
  )

  /**
   * Optimistic local writes, and the epoch that counts them.
   *
   * Reads travel by GET now (src/lib/reads.ts) and no longer queue behind
   * writes the way Server Functions did, so "reload the truth" can set out
   * before a student's gesture and come back after it. Applying it then would
   * erase a row they can already see — and worse, an in-flight create whose
   * temp row was erased has nothing left to swap its server id onto, so the
   * concept vanishes until the next reload. Every local write bumps the epoch;
   * a whole-truth read applies only if the epoch it set out under still holds.
   *
   * A write's OWN response (mergeConcepts, the imports, the worked example)
   * still applies unconditionally: it is the truth including that write.
   */
  const writeEpoch = useRef(0)
  const applyLocal: typeof setState = (updater) => {
    writeEpoch.current += 1
    setState(updater)
  }

  /**
   * Replace the whole state with a truth that already accounts for a write —
   * a batch action's return, a reset, a sign-out blank. Bumps the epoch for
   * the same reason a local write does: an older read must not undo it.
   */
  const applyTruth = useCallback((data: LoomState) => {
    writeEpoch.current += 1
    setState(data)
  }, [])

  /** Reload the whole loom, unless a local write overtook the request. */
  const loadLoom = useCallback(async () => {
    const at = writeEpoch.current
    const data = await getUserLoomData()
    if (writeEpoch.current !== at) return false
    setState(data)
    return true
  }, [])

  const flashTimer = useRef<number | undefined>(undefined)
  const flash = useCallback((msg: string) => {
    setFlashMsg(msg)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashMsg(null), 1500)
  }, [])

  // Keyed on the stable user id, not the session object: next-auth mints a new
  // session object on every window-focus refetch, and reloading (isLoading →
  // true) on each one blanks the whole workbench under the student — losing
  // in-progress tab state every time they tab away and back.
  const userId = session?.user?.id
  useEffect(() => {
    if (userId) {
      const startTimer = window.setTimeout(() => setIsLoading(true), 0)
      loadLoom().then(() => {
        setIsLoading(false)
      }).catch(err => {
        console.error("Failed to load loom data", err)
        setIsLoading(false)
      })
      return () => window.clearTimeout(startTimer)
    } else {
      const resetTimer = window.setTimeout(() => {
        // Signing out invalidates any read still in flight for the old user.
        applyTruth(blankState())
        setIsLoading(false)
      }, 0)
      return () => window.clearTimeout(resetTimer)
    }
    // loadLoom and applyTruth are stable (useCallback, no deps): listing them
    // satisfies the linter without making this effect re-run on anything but
    // the user changing.
  }, [userId, loadLoom, applyTruth])

  // v14 flashed on every save; here the graph mutations were silent on success,
  // so the save dot only ever confirmed the read. Callers that have something
  // more specific to say ("byte added", "thread thrown") flash after this and
  // simply win, since the last message displayed is the one that shows.
  const savedOk = useCallback(() => flash("saved"), [flash])

  // A failed edit or delete leaves optimistic state lying about the server.
  // Reload the truth and say so, instead of diverging silently.
  const resync = useCallback(async (err: unknown) => {
    console.error("Loom mutation failed", err)
    flash(err instanceof Error && err.message !== "Unauthorized" ? err.message : "could not save — reloaded")
    try {
      await loadLoom()
    } catch (reloadErr) {
      console.error("Failed to reload loom data", reloadErr)
    }
  }, [flash, loadLoom])

  const addConcept = async (label: string, def?: string, note?: string) => {
    const tempId = crypto.randomUUID()
    const tempConcept: Concept = { id: tempId, courseId: null, userId: session!.user!.id, label, def: def || "", note: note || "", createdAt: new Date() }
    applyLocal(s => ({ ...s, concepts: [...s.concepts, tempConcept] }))
    try {
      const saved = await createConcept({ label, def, note })
      applyLocal(s => ({ ...s, concepts: s.concepts.map(c => c.id === tempId ? saved : c) }))
      savedOk()
      return saved
    } catch (e) {
      applyLocal(s => ({ ...s, concepts: s.concepts.filter(c => c.id !== tempId) }))
      throw e
    }
  }

  const editConcept = async (id: string, data: Partial<{label: string, def: string, note: string}>) => {
    applyLocal(s => ({
      ...s,
      concepts: s.concepts.map(c => c.id === id ? { ...c, ...data } : c)
    }))
    try {
      await updateConcept(id, data)
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  const removeConcept = async (id: string) => {
    applyLocal(s => ({
      ...s,
      concepts: s.concepts.filter(c => c.id !== id),
      // The passages survive their label (P0.1): only the pointer goes.
      bytes: s.bytes.map(b =>
        b.conceptIds.includes(id)
          ? { ...b, conceptIds: b.conceptIds.filter(cid => cid !== id) }
          : b
      ),
      edges: s.edges.filter(e => e.fromId !== id && e.toId !== id),
      maps: s.maps.map(m =>
        id in m.tiers
          ? { ...m, tiers: Object.fromEntries(Object.entries(m.tiers).filter(([k]) => k !== id)) }
          : m
      ),
      views: Object.fromEntries(
        Object.entries(s.views).map(([key, v]) => [key, {
          ...v,
          positions: Object.fromEntries(Object.entries(v.positions).filter(([k]) => k !== id)),
          order: v.order?.filter((cid) => cid !== id),
          pins: v.pins?.filter((cid) => cid !== id),
        }])
      ) as LoomViews,
    }))
    try {
      await deleteConcept(id)
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  const mergeConcepts = async (sourceId: string, targetId: string) => {
    // The server repoints pointers, threads, tiers and views in one batch and
    // returns the whole truth — simpler and safer than replaying that
    // bookkeeping optimistically.
    try {
      const data = await mergeConceptsAction(sourceId, targetId)
      applyTruth(data)
      flash("merged — evidence and threads now point at one concept")
    } catch (e) {
      await resync(e)
      throw e
    }
  }

  const addByte = async (conceptIds: string[], source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, sourceId?: string, pageContentHash?: string) => {
    const tempId = crypto.randomUUID()
    // Capturing inside a reading stamps that reading, so a byte taken by hand
    // has the same provenance as one taken from the PDF and lands in the same
    // lens. An explicit sourceId (the PDF capture path) always wins.
    const stampedSourceId = sourceId ?? soleSourceId(scope) ?? undefined
    const tempByte: Byte = {
      id: tempId,
      courseId: null,
      userId: session!.user!.id,
      conceptIds,
      source,
      sourceId: stampedSourceId ?? null,
      location,
      content,
      pageNumber: pageNumber ?? null,
      startOffset: startOffset ?? null,
      endOffset: endOffset ?? null,
      pageContentHash: pageContentHash ?? null,
      note: "",
      question: "",
      isPullQuote: false,
      tier: "",
      createdAt: new Date()
    }
    applyLocal(s => ({ ...s, bytes: [...s.bytes, tempByte] }))
    try {
      const saved = await createByte({ conceptIds, source, sourceId: stampedSourceId, location, content, pageNumber, startOffset, endOffset, pageContentHash })
      applyLocal(s => ({ ...s, bytes: s.bytes.map(b => b.id === tempId ? saved : b) }))
      savedOk()
      return saved
    } catch (e) {
      applyLocal(s => ({ ...s, bytes: s.bytes.filter(b => b.id !== tempId) }))
      throw e
    }
  }

  const removeByte = async (id: string) => {
    applyLocal(s => ({ ...s, bytes: s.bytes.filter(b => b.id !== id) }))
    try {
      await deleteByte(id)
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  const attributeBytes = async (byteIds: string[], sourceId: string) => {
    const ids = new Set(byteIds)
    applyLocal(s => ({
      ...s,
      bytes: s.bytes.map(b => (ids.has(b.id) && !b.sourceId ? { ...b, sourceId } : b)),
    }))
    try {
      const n = await attributeBytesAction(byteIds, sourceId)
      flash(n === 1 ? "passage placed in its reading" : `${n} passages placed in their reading`)
      return n
    } catch (e) {
      await resync(e)
      throw e
    }
  }

  const refileByte = async (byteId: string, conceptId: string) => {
    try {
      // The byte gains a pointer (ruling 37) — same row, one more concept.
      const saved = await refileByteAction(byteId, conceptId)
      applyLocal(s => ({ ...s, bytes: s.bytes.map(b => b.id === saved.id ? saved : b) }))
      savedOk()
      return saved
    } catch (e) {
      await resync(e)
      throw e
    }
  }

  const unfileByte = async (byteId: string, conceptId: string) => {
    applyLocal(s => ({
      ...s,
      bytes: s.bytes.map(b =>
        b.id === byteId ? { ...b, conceptIds: b.conceptIds.filter(id => id !== conceptId) } : b
      ),
    }))
    try {
      await unfileByteAction(byteId, conceptId)
      flash("unfiled — the passage keeps its other filings")
    } catch (e) {
      await resync(e)
    }
  }

  // Cloth title/description: optimistic upsert against the given scope (the
  // current one unless a caller names another scope explicitly).
  const updateCloth = async (data: Partial<{ title: string; description: string }>, scopeKeyArg?: string) => {
    const key = scopeKeyArg ?? scope.key
    const now = new Date()
    applyLocal(s => {
      const existing = s.cloths.find(c => c.scopeKey === key)
      const cloths = existing
        ? s.cloths.map(c => (c.scopeKey === key ? { ...c, ...data, updatedAt: now } : c))
        : [...s.cloths, {
            id: crypto.randomUUID(),
            courseId: null,
            userId: session!.user!.id,
            scopeKey: key,
            title: data.title ?? "",
            description: data.description ?? "",
            createdAt: now,
            updatedAt: now,
          }]
      return { ...s, cloths }
    })
    try {
      const saved = await saveClothAction({ scopeKey: key, ...data })
      applyLocal(s => ({
        ...s,
        cloths: s.cloths.some(c => c.scopeKey === key)
          ? s.cloths.map(c => (c.scopeKey === key ? saved : c))
          : [...s.cloths, saved],
      }))
      savedOk()
      return true
    } catch (e) {
      await resync(e)
      return false
    }
  }

  // Optimistic create WITH AN ID ALIAS, exactly as maps have (below): "coin a
  // term" and "remove" bind to the thread the moment it renders, and the
  // create can take seconds — so a term saved against the temp id was silently
  // lost, and a remove against it silently deleted nothing (the server matches
  // no row and reports success), leaving a ghost thread that returned on the
  // next load. Writes wait for the create and are re-addressed to the server's
  // id; local edits made mid-flight are newer than the just-born server row
  // and are kept over it on swap.
  const edgeCreates = useRef<Map<string, Promise<Edge>>>(new Map())
  const edgeAlias = useRef<Map<string, string>>(new Map())
  const resolveEdgeId = useCallback(async (id: string) => {
    const inflight = edgeCreates.current.get(id)
    // A failed create already rolled its row back; falling through to the
    // temp id makes the write a harmless no-op rather than a second error.
    if (inflight) await inflight.catch(() => {})
    return edgeAlias.current.get(id) ?? id
  }, [])

  const addEdge = async (fromId: string, toId: string, sentence: string) => {
    const tempId = crypto.randomUUID()
    const tempEdge: Edge = { id: tempId, courseId: null, userId: session!.user!.id, fromId, toId, handle: "", sentence, createdAt: new Date() }
    applyLocal(s => ({ ...s, edges: [...s.edges, tempEdge] }))
    const creating = (async () => {
      try {
        const saved = await createEdge({ fromId, toId, sentence })
        edgeAlias.current.set(tempId, saved.id)
        // Identity from the server, fields from the local row — a handle
        // coined mid-flight must not be wiped by the just-born server copy.
        applyLocal(s => ({
          ...s,
          edges: s.edges.map(e =>
            e.id === tempId
              ? { ...e, id: saved.id, courseId: saved.courseId, createdAt: saved.createdAt }
              : e
          ),
        }))
        savedOk()
        return saved
      } catch (e) {
        applyLocal(s => ({ ...s, edges: s.edges.filter(e => e.id !== tempId) }))
        throw e
      } finally {
        edgeCreates.current.delete(tempId)
      }
    })()
    edgeCreates.current.set(tempId, creating)
    return creating
  }

  const editEdge = async (id: string, data: Partial<{handle: string, sentence: string}>) => {
    // The state row may carry either side of the alias by now — match both.
    const knownIds = new Set([id, edgeAlias.current.get(id) ?? id])
    applyLocal(s => ({ ...s, edges: s.edges.map(e => knownIds.has(e.id) ? { ...e, ...data } : e) }))
    try {
      await updateEdge(await resolveEdgeId(id), data)
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  const removeEdge = async (id: string) => {
    const knownIds = new Set([id, edgeAlias.current.get(id) ?? id])
    applyLocal(s => ({
      ...s,
      edges: s.edges.filter(e => !knownIds.has(e.id)),
      views: Object.fromEntries(
        Object.entries(s.views).map(([key, v]) => [key, {
          ...v,
          bends: Object.fromEntries(Object.entries(v.bends).filter(([k]) => !knownIds.has(k))),
        }])
      ) as LoomViews,
    }))
    try {
      await deleteEdge(await resolveEdgeId(id))
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  // --- MAPS ---

  const selectMap = (id: string) => {
    setSelectedByScope((s) => ({ ...s, [scope.key]: id }))
  }

  // Optimistic create WITH AN ID ALIAS. The rename input, the essence field
  // and the tier chips bind to the active map the moment it exists, and the
  // create can take seconds — so the temp row must appear (and be selected)
  // instantly, or every gesture in that window lands on the PREVIOUSLY active
  // map (it renamed a student's real map in testing). Writes made against the
  // temp id wait for the create and are re-addressed to the server's id; local
  // edits made mid-flight are newer than the just-born server row and are kept
  // over it on swap.
  const mapCreates = useRef<Map<string, Promise<string>>>(new Map())
  const mapAlias = useRef<Map<string, string>>(new Map())
  const resolveMapId = useCallback(async (id: string) => {
    const inflight = mapCreates.current.get(id)
    if (inflight) await inflight
    return mapAlias.current.get(id) ?? id
  }, [])

  const addMap = async (name?: string) => {
    // "Projection", never "map", anywhere a student reads (rulings 2/13/32).
    const mapName = (name ?? `Projection ${scopeMaps.length + 1}`).trim() || "Projection"
    const tempId = crypto.randomUUID()
    const now = new Date()
    const temp: LoomMap = {
      id: tempId, courseId: null, userId: session!.user!.id,
      scopeKey: scope.key, name: mapName, read: "", essence: "", tiers: {},
      createdAt: now, updatedAt: now,
    }
    applyLocal(s => ({ ...s, maps: [...s.maps, temp] }))
    setSelectedByScope(s => ({ ...s, [scope.key]: tempId }))
    const creating = (async () => {
      try {
        const saved = await createMapAction({ scopeKey: scope.key, name: mapName })
        mapAlias.current.set(tempId, saved.id)
        applyLocal(s => {
          const views = { ...s.views }
          const tempKey = `map:${tempId}`
          if (views[tempKey]) {
            views[`map:${saved.id}`] = views[tempKey]
            delete views[tempKey]
          }
          return {
            ...s,
            maps: s.maps.map(m =>
              m.id === tempId
                ? { ...m, id: saved.id, courseId: saved.courseId, createdAt: saved.createdAt }
                : m
            ),
            views,
          }
        })
        setSelectedByScope(s => (s[scope.key] === tempId ? { ...s, [scope.key]: saved.id } : s))
        savedOk()
        return saved.id
      } catch (e) {
        applyLocal(s => {
          const views = { ...s.views }
          delete views[`map:${tempId}`]
          return { ...s, maps: s.maps.filter(m => m.id !== tempId), views }
        })
        setSelectedByScope(s => {
          if (s[scope.key] !== tempId) return s
          const next = { ...s }
          delete next[scope.key]
          return next
        })
        throw e
      } finally {
        mapCreates.current.delete(tempId)
      }
    })()
    mapCreates.current.set(tempId, creating)
    // Resolve only once the map is real, so ensureActiveMap-mediated gestures
    // are handed a server-backed id; the UI meanwhile works on the temp row.
    const realId = await creating
    return { ...temp, id: realId }
  }

  // First gesture in a fresh scope mints its map; concurrent gestures share the
  // one in-flight create rather than minting siblings.
  const pendingCreate = useRef<Map<string, Promise<LoomMap>>>(new Map())
  const ensureActiveMap = async (): Promise<LoomMap> => {
    if (activeMap) return activeMap
    const key = scope.key
    const inflight = pendingCreate.current.get(key)
    if (inflight) return inflight
    const creating = addMap()
      .then((m) => {
        flash(`new projection started — "${m.name}"`)
        return m
      })
      .finally(() => pendingCreate.current.delete(key))
    pendingCreate.current.set(key, creating)
    return creating
  }

  const setMapTiers = async (id: string, tiers: Record<string, Tier>) => {
    const stored: Record<string, Tier> = {}
    Object.entries(tiers).forEach(([cid, t]) => { if (t) stored[cid] = t })
    applyLocal(s => ({
      ...s,
      maps: s.maps.map(m => m.id === id ? { ...m, tiers: stored, updatedAt: new Date() } : m),
    }))
    try {
      await updateMapAction(await resolveMapId(id), { tiers: stored })
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  // Map text (name / read / essence) persists debounced per map, merged so a
  // read keystroke and an essence keystroke inside the window land as one save.
  const mapTextTimer = useRef<number | undefined>(undefined)
  const pendingMapText = useRef<Map<string, Partial<{ name: string; read: string; essence: string }>>>(new Map())
  const persistMapText = useCallback(() => {
    const pending = pendingMapText.current
    if (!pending.size) return
    pendingMapText.current = new Map()
    pending.forEach((data, id) => {
      resolveMapId(id)
        .then((realId) => updateMapAction(realId, data))
        .then(() => flash("saved"))
        .catch((e) => {
          console.error("Failed to save map", e)
          flash("projection not saved — try again")
        })
    })
  }, [flash, resolveMapId])

  const queueMapText = (id: string, data: Partial<{ name: string; read: string; essence: string }>) => {
    applyLocal(s => ({
      ...s,
      maps: s.maps.map(m => m.id === id ? { ...m, ...data, updatedAt: new Date() } : m),
    }))
    const current = pendingMapText.current.get(id) ?? {}
    pendingMapText.current.set(id, { ...current, ...data })
    window.clearTimeout(mapTextTimer.current)
    mapTextTimer.current = window.setTimeout(persistMapText, 700)
  }

  const renameMap = (id: string, name: string) => queueMapText(id, { name })
  const setMapRead = (id: string, read: string) => queueMapText(id, { read })
  const setMapEssence = (id: string, essence: string) => queueMapText(id, { essence })

  const flushMapText = useCallback(() => {
    window.clearTimeout(mapTextTimer.current)
    persistMapText()
  }, [persistMapText])

  const removeMap = async (id: string) => {
    applyLocal(s => {
      const views = { ...s.views }
      delete views[`map:${id}`]
      return { ...s, maps: s.maps.filter(m => m.id !== id), views }
    })
    try {
      await deleteMapAction(await resolveMapId(id))
      flash("projection removed")
    } catch (e) {
      await resync(e)
    }
  }

  // Blur flushes inside the app; a hidden tab is the closest reliable signal
  // before a close. (A server-action fetch during full unload can still be
  // aborted by the browser — the debounce window is the residual risk.)
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushMapText()
    }
    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pagehide", flushMapText)
    return () => {
      document.removeEventListener("visibilitychange", onHidden)
      window.removeEventListener("pagehide", flushMapText)
    }
  }, [flushMapText])

  // View geometry: only called from student gestures (drag end, bend end,
  // de-tier cleanup) — auto-layout stays ephemeral in the component. Debounced
  // PER KEY, and merged into the views record rather than replacing it, so one
  // map's drag can never clobber another's stored arrangement.
  const viewTimers = useRef<Map<string, number>>(new Map())
  const pendingViews = useRef<Map<string, CardTableView>>(new Map())
  const setView = (key: string, next: CardTableView) => {
    applyLocal(s => ({ ...s, views: { ...s.views, [key]: next } }))
    pendingViews.current.set(key, next)
    const existing = viewTimers.current.get(key)
    if (existing !== undefined) window.clearTimeout(existing)
    viewTimers.current.set(key, window.setTimeout(async () => {
      viewTimers.current.delete(key)
      const data = pendingViews.current.get(key)
      pendingViews.current.delete(key)
      if (!data) return
      try {
        // Geometry drawn on a map that is still being created persists under
        // the server's id once it exists.
        const mapKey = /^map:(.+)$/.exec(key)
        const persistKey = mapKey ? `map:${await resolveMapId(mapKey[1])}` : key
        await saveView(persistKey, data)
      } catch (e) {
        console.error("Failed to save view", e)
        flash("arrangement not saved — try again")
      }
    }, 500))
  }

  // A replace-the-graph operation must not race a stale debounced save: a
  // pending view/map write landing after the replacement would resurrect
  // pre-replacement state on the server.
  const cancelPendingSaves = useCallback(() => {
    viewTimers.current.forEach((timer) => window.clearTimeout(timer))
    viewTimers.current.clear()
    pendingViews.current.clear()
    window.clearTimeout(mapTextTimer.current)
    pendingMapText.current.clear()
  }, [])

  const importFromText = async (raw: string) => {
    const parsed = parseImport(raw) // throws with a friendly message on bad input
    cancelPendingSaves()
    setSelectedByScope({})
    try {
      const data = await importGraph(parsed)
      applyTruth(data)
      flash("imported")
    } catch (e) {
      // The batch is atomic server-side, but the client must not keep showing
      // a graph the server may or may not hold — reload the truth.
      try { await loadLoom() } catch { /* initial load error path already logs */ }
      throw e
    }
  }

  const importMapFile = async (parsed: ParsedMapImport) => {
    const { data, mapId, scopeKey, skipped } = await importMapArrangement(parsed)
    applyTruth(data)
    // Make the arrival visible: the new map is the selected one in its scope.
    setSelectedByScope((prev) => ({ ...prev, [scopeKey]: mapId }))
    flash(skipped > 0 ? `projection added — ${skipped} card${skipped !== 1 ? "s" : ""} not on this table` : "projection added")
    return { skipped }
  }

  const resetAll = async () => {
    cancelPendingSaves()
    setSelectedByScope({})
    await resetGraph()
    applyTruth(blankState())
    flash("cleared — the history of your weaving is kept")
  }

  const loadExample = async () => {
    cancelPendingSaves()
    setSelectedByScope({})
    const data = await loadWorkedExample()
    applyTruth(data)
    flash("worked example loaded — explore it, then reset")
  }

  return (
    <LoomContext.Provider value={{
      state, scope, scoped, scopedState, isLoading,
      studentName: session?.user?.name || "",
      addConcept, editConcept, removeConcept, mergeConcepts,
      addByte, removeByte, refileByte, unfileByte, attributeBytes,
      activeCloth, updateCloth,
      addEdge, editEdge, removeEdge,
      maps: state.maps, scopeMaps, activeMap,
      selectMap, addMap, renameMap, removeMap,
      setMapTiers, setMapRead, setMapEssence, flushMapText,
      setView, ensureActiveMap,
      importFromText, importMapFile, resetAll, loadExample,
      flashMsg, flash,
      undoStack, setUndoStack, redoStack, setRedoStack
    }}>
      {children}
    </LoomContext.Provider>
  )
}

export function useLoom() {
  const context = useContext(LoomContext)
  if (!context) throw new Error("useLoom must be used within a LoomProvider")
  return context
}
