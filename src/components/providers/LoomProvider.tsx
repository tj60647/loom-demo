"use client"

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react"
import { useSession } from "next-auth/react"
import { useParams } from "next/navigation"
import type { Passage, CardTableView, Cloth, Concept, Edge, Link, LoomMap, LoomState, LoomViews, Tier } from "@/lib/types"
import { asLoomState, scopeOf, scopedGraph, soleSourceId, WHOLE_WEAVE, type Scope, type ScopedGraph } from "@/lib/scope"
import { emptyViews } from "@/lib/graphExport"
import { getUserLoomData } from "@/lib/reads"
import {
  createConcept, updateConcept, deleteConcept, mergeConcepts as mergeConceptsAction,
  createPassage, deletePassage, addPassageConcept as addPassageConceptAction, unfilePassage as unfilePassageAction, attributePassages as attributePassagesAction,
  updatePassageNote as updatePassageNoteAction,
  createEdge, updateEdge, deleteEdge,
  createLink, updateLink, attachLink as attachLinkAction,
  saveView, saveCloth as saveClothAction,
  createMap as createMapAction, updateMap as updateMapAction, deleteMap as deleteMapAction,
  resetLoom as resetLoomAction, resetReading as resetReadingAction,
} from "@/actions/loom"

/** What a reset cleared, for the line the modal shows afterwards. */
export type ResetCounts = {
  concepts: number; passages: number; edges: number
  links: number; maps: number; cloths: number; views: number
}

/**
 * What clearing ONE reading took. Deliberately three fields and not seven:
 * concepts, links and threads are user-level and survive a reading-scoped
 * reset, so a shape that could report them would invite reporting zero and
 * reading as though they had been checked.
 */
export type ReadingResetCounts = { passages: number; cloths: number; maps: number }

/**
 * Exported so the practice sandbox can supply this same context from its own
 * provider (src/components/providers/SandboxLoomProvider.tsx). React resolves
 * useContext to the NEAREST provider, so nesting one inside the sandbox
 * subtree overrides this one with no change to any tab — and because that
 * provider never imports `@/actions/loom`, a write escaping into a real loom
 * is impossible by construction rather than by discipline.
 */
export interface LoomContextType {
  /**
   * Open Loom (src/lib/viewUser.ts): true when the state below is a
   * STUDENT's loom a staff viewer is reading. Every mutating function in
   * this context refuses with a flash when set — the server was always safe
   * (writes derive their owner from the session), but the optimistic client
   * state made an edit LOOK like it landed on the student's work, which is
   * worse than refusing (TJ, 2026-08-21: "why in read only mode can i edit
   * a students work?"). Stations also read it to hide their controls.
   */
  readOnly: boolean
  /**
   * The WHOLE graph, always. Each object's own download slices it at the
   * point of export; nothing else does (red line #5).
   */
  state: LoomState
  /**
   * The reading the student is working in, read off the route. `WHOLE_WEAVE`
   * is what a surface that is not a reading gets — the Library — and since
   * 2026-08-11 no student surface works in it.
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
  /**
   * Capture a passage. Zero concept ids is a legal capture — an Unlabeled
   * Passage (model §Passage: "It may never gain a Concept, which is fine").
   * `note` is the passage's own gloss, which the model has always had a place
   * for in the Capture Log — Passage + Gloss + Concept Label — and which no
   * capture surface could write until 2026-08-12.
   */
  addPassage: (conceptIds: string[], source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, sourceId?: string, pageContentHash?: string, note?: string) => Promise<Passage>
  removePassage: (id: string) => Promise<void>
  /** Say which reading passages came from — the student's answer, never a guess. */
  attributePassages: (passageIds: string[], sourceId: string) => Promise<number>
  /** File a passage under another concept — adds a pointer, never copies the passage. */
  addPassageConcept: (passageId: string, conceptId: string) => Promise<Passage>
  /** Remove one concept pointer from a passage — the passage itself survives. */
  unfilePassage: (passageId: string, conceptId: string) => Promise<void>
  /** Revise a passage's note. The first way to change one after capture. */
  editPassageNote: (passageId: string, note: string) => Promise<void>
  /** The current scope's cloth (title + description), or null before one is written. */
  activeCloth: Cloth | null
  /**
   * Title or describe a cloth — the current scope's by default, or an explicit
   * scope's (the shelf creates a reading's cloth from the whole-weave scope).
   *
   * Local at once, server after 700ms — a projection's text contract, which
   * the cloth joined on 2026-08-13 when its Save button went. Void, not a
   * promise: there is no moment for a caller to await any more, which is the
   * point. `flushCloth` on blur if you need it sooner.
   */
  updateCloth: (data: Partial<{ title: string; description: string }>, scopeKey?: string) => void
  /** Push a pending cloth write immediately (blur), as `flushMapText` does. */
  flushCloth: () => void
  addEdge: (fromId: string, toId: string, sentence: string) => Promise<Edge>
  editEdge: (id: string, data: Partial<{handle: string, sentence: string}>) => Promise<void>
  removeEdge: (id: string) => Promise<void>
  /**
   * The Link vocabulary the student owns (5.1) — user-level, like concepts.
   * A Link with no Thread using it lives here and nowhere else, which is the
   * state the object exists for (TJ, 2026-08-10).
   */
  links: Link[]
  /** Coin a Link, or return the one already owned for that label. */
  addLink: (label: string, description?: string) => Promise<Link>
  /** Sharpen a Link's label or its own gloss — shared by every Thread using it. */
  editLink: (id: string, data: Partial<{ label: string; description: string }>) => Promise<void>
  /** Point a Thread at a Link the student already owns — attach, never copy. */
  attachLink: (edgeId: string, linkId: string | null) => Promise<void>
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
  /** Create a map in the current scope (default name "Projection N") and select it. */
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
   * The active map, creating "Projection N" first when the scope has none — so the
   * first tier chip / drag / keystroke in a fresh scope just works. The create
   * is itself a student gesture's consequence, and it is flashed.
   */
  ensureActiveMap: () => Promise<LoomMap>
  /**
   * Start over — clear this loom and return what was in it (My Loom modal).
   *
   * The practice loom supplies its own, which clears local state and calls
   * nothing: "reset stays — clearing your own practice costs nothing"
   * (contracts.md §2c). The Header's modal suppresses the control there
   * anyway, because the counts it would be clearing belong to the real loom
   * behind the practice one and the page promises nothing is kept.
   */
  resetLoom: () => Promise<ResetCounts>
  /**
   * Start one reading over — its captures, its cloth, its projections. The
   * concepts those passages evidenced stay, some of them now carrying no
   * evidence, which is a state the app names rather than a fault.
   */
  resetReading: (sourceId: string) => Promise<ReadingResetCounts>
  /**
   * Drop every debounced write still waiting — cloth text, map text, view
   * geometry — without sending it. The course switch's quiesce step: text is
   * FLUSHED first (the student's words belong in the course they were typed
   * in), then this kills the 500ms view timers, which have no flush and
   * would otherwise fire mid-switch and resolve the NEW course server-side.
   */
  cancelPendingSaves: () => void
  /**
   * Tell every OTHER tab a course switch happened. Siblings cancel their own
   * pending writes and hard-reload (the effect below); the posting channel
   * never receives its own message, so the switching tab is not raced. Lives
   * here, not in ReadingsProvider, because the state that must die before
   * the reload is this provider's.
   */
  announceCourseSwitch: () => void
  /** Transient status line (v14's saveDot): '· saved ·', '· copied ·', errors. */
  flashMsg: string | null
  flash: (msg: string) => void
  undoStack: {edgeId: string, from: string | null, to: string | null}[]
  setUndoStack: React.Dispatch<React.SetStateAction<{edgeId: string, from: string | null, to: string | null}[]>>
  redoStack: {edgeId: string, from: string | null, to: string | null}[]
  setRedoStack: React.Dispatch<React.SetStateAction<{edgeId: string, from: string | null, to: string | null}[]>>
}

export const LoomContext = createContext<LoomContextType | null>(null)

const blankState = (): LoomState => ({ concepts: [], passages: [], edges: [], links: [], maps: [], cloths: [], views: emptyViews() })

export function LoomProvider({ children, readOnly = false }: { children: ReactNode; readOnly?: boolean }) {
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
   * A write's OWN response (mergeConcepts, the resets)
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
  // more specific to say ("passage added", "thread thrown") flash after this and
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
      // The reading you were in when you named it — the act's context, which
      // the provider already knows from the route, so no caller changes.
      const saved = await createConcept({ label, def, note, atSourceId: soleSourceId(scope) })
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
      await updateConcept(id, data, soleSourceId(scope))
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
      passages: s.passages.map(b =>
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
      await deleteConcept(id, soleSourceId(scope))
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
      const data = await mergeConceptsAction(sourceId, targetId, soleSourceId(scope))
      applyTruth(data)
      flash("merged — evidence and threads now point at one concept")
    } catch (e) {
      await resync(e)
      throw e
    }
  }

  const addPassage = async (conceptIds: string[], source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, sourceId?: string, pageContentHash?: string, note?: string) => {
    const tempId = crypto.randomUUID()
    // Capturing inside a reading stamps that reading, so a passage taken by hand
    // has the same provenance as one taken from the PDF and lands in the same
    // lens. An explicit sourceId (the PDF capture path) always wins.
    const stampedSourceId = sourceId ?? soleSourceId(scope) ?? undefined
    const tempPassage: Passage = {
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
      note: note ?? "",
      question: "",
      isPullQuote: false,
      tier: "",
      createdAt: new Date()
    }
    applyLocal(s => ({ ...s, passages: [...s.passages, tempPassage] }))
    try {
      const saved = await createPassage({ conceptIds, source, sourceId: stampedSourceId, location, content, pageNumber, startOffset, endOffset, pageContentHash, note })
      applyLocal(s => ({ ...s, passages: s.passages.map(b => b.id === tempId ? saved : b) }))
      savedOk()
      return saved
    } catch (e) {
      applyLocal(s => ({ ...s, passages: s.passages.filter(b => b.id !== tempId) }))
      throw e
    }
  }

  const removePassage = async (id: string) => {
    applyLocal(s => ({ ...s, passages: s.passages.filter(b => b.id !== id) }))
    try {
      await deletePassage(id)
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  const attributePassages = async (passageIds: string[], sourceId: string) => {
    const ids = new Set(passageIds)
    applyLocal(s => ({
      ...s,
      passages: s.passages.map(b => (ids.has(b.id) && !b.sourceId ? { ...b, sourceId } : b)),
    }))
    try {
      const n = await attributePassagesAction(passageIds, sourceId)
      flash(n === 1 ? "passage placed in its reading" : `${n} passages placed in their reading`)
      return n
    } catch (e) {
      await resync(e)
      throw e
    }
  }

  const addPassageConcept = async (passageId: string, conceptId: string) => {
    try {
      // The passage gains a pointer (ruling 37) — same row, one more concept.
      const saved = await addPassageConceptAction(passageId, conceptId)
      applyLocal(s => ({ ...s, passages: s.passages.map(b => b.id === saved.id ? saved : b) }))
      savedOk()
      return saved
    } catch (e) {
      await resync(e)
      throw e
    }
  }

  const editPassageNote = async (passageId: string, note: string) => {
    applyLocal(s => ({
      ...s,
      passages: s.passages.map(b => (b.id === passageId ? { ...b, note } : b)),
    }))
    try {
      await updatePassageNoteAction(passageId, note)
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  const unfilePassage = async (passageId: string, conceptId: string) => {
    applyLocal(s => ({
      ...s,
      passages: s.passages.map(b =>
        b.id === passageId ? { ...b, conceptIds: b.conceptIds.filter(id => id !== conceptId) } : b
      ),
    }))
    try {
      await unfilePassageAction(passageId, conceptId)
      flash("unfiled — the passage keeps its other filings")
    } catch (e) {
      await resync(e)
    }
  }

  /**
   * Cloth title/description — optimistic locally, DEBOUNCED to the server, on
   * the same contract as a projection's name / one-line / paragraph below.
   *
   * It used to be the one manual save left in Loom: a Save button, a dirty
   * flag, and text that was simply lost if a student typed a title and walked
   * away (TJ, 2026-08-13: "why is there a 'save cloth' button in 'your work'?
   * isnt that the download?"). A projection's title in the same situation is
   * kept. Same kind of field on the same kind of object, two contracts, and no
   * way for a student to tell which surface they were on.
   *
   * The counter-argument was in ClothFold's own header — a deliberate press is
   * what mints the cloth row, so autosave lets a stray keystroke create one.
   * Projections already have that property (the first keystroke in a fresh
   * scope mints "Projection N") and autosave anyway; the app had answered this
   * everywhere except here.
   *
   * Merged per scope, so a title keystroke and a description keystroke inside
   * the window land as one write.
   */
  const clothTextTimer = useRef<number | undefined>(undefined)
  const pendingClothText = useRef<Map<string, Partial<{ title: string; description: string }>>>(new Map())

  const writeCloth = useCallback(async (key: string, data: Partial<{ title: string; description: string }>) => {
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
  }, [savedOk, resync])

  const persistClothText = useCallback(() => {
    const pending = pendingClothText.current
    if (!pending.size) return
    pendingClothText.current = new Map()
    pending.forEach((data, key) => { void writeCloth(key, data) })
  }, [writeCloth])

  const flushCloth = useCallback(() => {
    window.clearTimeout(clothTextTimer.current)
    persistClothText()
  }, [persistClothText])

  const updateCloth = (data: Partial<{ title: string; description: string }>, scopeKeyArg?: string) => {
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
    const current = pendingClothText.current.get(key) ?? {}
    pendingClothText.current.set(key, { ...current, ...data })
    window.clearTimeout(clothTextTimer.current)
    clothTextTimer.current = window.setTimeout(persistClothText, 700)
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
    const tempEdge: Edge = { id: tempId, courseId: null, userId: session!.user!.id, fromId, toId, handle: "", linkId: null, sentence, createdAt: new Date() }
    applyLocal(s => ({ ...s, edges: [...s.edges, tempEdge] }))
    const creating = (async () => {
      try {
        const saved = await createEdge({ fromId, toId, sentence, atSourceId: soleSourceId(scope) })
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
      // Typing a label coins the Link OBJECT server-side, and the row comes
      // back so it can join the Link List now rather than at the next reload.
      // `undefined` means the edit never touched the label; null means it was
      // cleared, and the thread must let go of the object too.
      const link = await updateEdge(await resolveEdgeId(id), data, soleSourceId(scope))
      if (link !== undefined) {
        applyLocal(s => ({
          ...s,
          links: !link ? s.links
            : s.links.some(l => l.id === link.id)
              ? s.links.map(l => (l.id === link.id ? link : l))
              : [...s.links, link],
          edges: s.edges.map(e => (knownIds.has(e.id) ? { ...e, linkId: link?.id ?? null } : e)),
        }))
      }
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
      await deleteEdge(await resolveEdgeId(id), soleSourceId(scope))
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  // --- LINKS (5.1) ---

  /**
   * Coin a Link, or adopt the one already owned for that label. Not
   * optimistic: the server decides whether this is a new object or one the
   * student already has, and guessing locally would show a duplicate row for
   * a beat and then take it away. The act is a deliberate one on a small
   * list, so the round trip is affordable.
   */
  const addLink = async (label: string, description?: string) => {
    const saved = await createLink({ label, description, atSourceId: soleSourceId(scope) })
    applyLocal(s => ({
      ...s,
      links: s.links.some(l => l.id === saved.id)
        ? s.links.map(l => (l.id === saved.id ? saved : l))
        : [...s.links, saved],
    }))
    savedOk()
    return saved
  }

  const editLink = async (id: string, data: Partial<{ label: string; description: string }>) => {
    applyLocal(s => ({
      ...s,
      links: s.links.map(l => (l.id === id ? { ...l, ...data } : l)),
      // A rename fans out to every thread's legacy copy server-side; mirror
      // it locally or the board and the list disagree until the next reload.
      edges: typeof data.label === "string"
        ? s.edges.map(e => (e.linkId === id ? { ...e, handle: data.label! } : e))
        : s.edges,
    }))
    try {
      await updateLink(id, data, soleSourceId(scope))
      savedOk()
    } catch (e) {
      await resync(e)
    }
  }

  const attachLink = async (edgeId: string, linkId: string | null) => {
    const link = linkId ? state.links.find(l => l.id === linkId) ?? null : null
    applyLocal(s => ({
      ...s,
      edges: s.edges.map(e => (e.id === edgeId ? { ...e, linkId, handle: link?.label ?? "" } : e)),
    }))
    try {
      await attachLinkAction(await resolveEdgeId(edgeId), linkId, soleSourceId(scope))
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
    // Both debounced texts, or the cloth would have gained an autosave and
    // kept exactly the loss the Save button used to cause.
    const flushText = () => { flushMapText(); flushCloth() }
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushText()
    }
    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pagehide", flushText)
    return () => {
      document.removeEventListener("visibilitychange", onHidden)
      window.removeEventListener("pagehide", flushText)
    }
  }, [flushMapText, flushCloth])

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

  /**
   * Drop every debounced write still waiting, without sending it.
   *
   * This guard was deleted on 2026-08-11 with the note "nothing replaces the
   * graph wholesale any more, so nothing needs the guard". Reset does, again.
   * Without it the failure is specific and awful: a student edits a
   * projection's essence, hits start over inside the 700ms window, and the
   * timer fires afterwards to `updateMap` a row that no longer exists —
   * harmless — or, worse, the 500ms view timer writes geometry back under a
   * `map:<id>` key and leaves one orphan row in a loom the student was told is
   * empty. Cleared here rather than flushed: the student asked for the work to
   * go, so the last keystroke of it goes too.
   */
  const cancelPendingSaves = useCallback(() => {
    window.clearTimeout(mapTextTimer.current)
    pendingMapText.current = new Map()
    // Cloth text joined the debounced writes on 2026-08-13 and has to be
    // cancelled here for the same reason map text is: a title typed 700ms
    // before "start over" would otherwise land AFTER the delete and upsert a
    // cloth row back into a scope the student was told is empty.
    window.clearTimeout(clothTextTimer.current)
    pendingClothText.current = new Map()
    viewTimers.current.forEach((t) => window.clearTimeout(t))
    viewTimers.current = new Map()
    pendingViews.current = new Map()
  }, [])

  // Cross-tab course switch. The switching tab announces AFTER the stamp; a
  // sibling that merely reloaded would then fire its own pagehide flush and
  // send course A's pending text into course B (the server resolves the
  // course at action time, and by then the stamp is committed). So a sibling
  // CANCELS first — dropping at most the debounce window of keystrokes in a
  // background tab — and reloads into the new course clean. The posting
  // channel object never receives its own message, so the switching tab
  // (which flushed BEFORE the stamp) is untouched.
  const courseChannel = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel("loom-course-switch")
    courseChannel.current = channel
    channel.onmessage = () => {
      cancelPendingSaves()
      window.location.reload()
    }
    return () => {
      courseChannel.current = null
      channel.close()
    }
  }, [cancelPendingSaves])
  const announceCourseSwitch = useCallback(() => {
    courseChannel.current?.postMessage("switched")
  }, [])

  const resetLoom = useCallback(async () => {
    cancelPendingSaves()
    const counts = await resetLoomAction()
    // The server's own truth for this write: everything of this student's is
    // gone, so the blank state IS the reload and no round trip is needed.
    applyTruth(blankState())
    return counts
  }, [cancelPendingSaves, applyTruth])

  const resetReading = useCallback(async (sourceId: string) => {
    cancelPendingSaves()
    const counts = await resetReadingAction(sourceId)
    // Unlike resetLoom, only PART of the loom went — a blank state would be a
    // lie and a local filter would have to re-derive which view rows belonged
    // to which projection. Re-read instead: this is the truth including the
    // write, so it applies unconditionally.
    applyTruth(await getUserLoomData())
    return counts
  }, [cancelPendingSaves, applyTruth])

  // Open Loom's guard, at the chokepoint. Every mutating member of the
  // context flows through here, so ONE refusal covers every station — the
  // pattern this repo prefers to a check at each of thirty call sites. The
  // server never needed protecting (writes derive their owner from the
  // session); what this kills is the optimistic client update that made an
  // edit LOOK like it landed on the student's work. `selectMap` stays live —
  // purely local, and browsing the student's projections is reading. The
  // refusal returns undefined where callers expect a created object; that is
  // accepted debris on paths the read-only UI pass will hide, and honest
  // beside the flash that names why nothing happened.
  const refuse = useCallback(async () => {
    flash("read-only — this is a student's loom; nothing was changed")
    return undefined
  }, [flash]) as unknown

  const value: LoomContextType = {
    readOnly,
    state, scope, scoped, scopedState, isLoading,
    studentName: session?.user?.name || "",
    addConcept, editConcept, removeConcept, mergeConcepts,
    addPassage, removePassage, addPassageConcept, unfilePassage, attributePassages, editPassageNote,
    activeCloth, updateCloth, flushCloth,
    addEdge, editEdge, removeEdge,
    links: state.links, addLink, editLink, attachLink,
    maps: state.maps, scopeMaps, activeMap,
    selectMap, addMap, renameMap, removeMap,
    setMapTiers, setMapRead, setMapEssence, flushMapText,
    setView, ensureActiveMap,
    resetLoom, resetReading,
    cancelPendingSaves, announceCourseSwitch,
    flashMsg, flash,
    undoStack, setUndoStack, redoStack, setRedoStack
  }

  const refusals = {
    addConcept: refuse, editConcept: refuse, removeConcept: refuse, mergeConcepts: refuse,
    addPassage: refuse, removePassage: refuse, addPassageConcept: refuse, unfilePassage: refuse,
    attributePassages: refuse, editPassageNote: refuse,
    updateCloth: refuse, flushCloth: refuse,
    addEdge: refuse, editEdge: refuse, removeEdge: refuse,
    addLink: refuse, editLink: refuse, attachLink: refuse,
    addMap: refuse, renameMap: refuse, removeMap: refuse,
    setMapTiers: refuse, setMapRead: refuse, setMapEssence: refuse, flushMapText: refuse,
    setView: refuse, ensureActiveMap: refuse,
    resetLoom: refuse, resetReading: refuse,
    // satisfies: a typo'd key would otherwise ADD a dead member instead of
    // replacing a live one, and the unknown-cast below would hide it.
  } satisfies Partial<Record<keyof LoomContextType, unknown>> as Partial<LoomContextType>

  return (
    <LoomContext.Provider value={readOnly ? { ...value, ...refusals } : value}>
      {children}
    </LoomContext.Provider>
  )
}

export function useLoom() {
  const context = useContext(LoomContext)
  if (!context) throw new Error("useLoom must be used within a LoomProvider")
  return context
}
