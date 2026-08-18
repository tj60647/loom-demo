"use client"

/**
 * The practice loom: the real interface, real gestures, nothing kept.
 *
 * TJ, 2026-08-10 — "in many games the actual interface is used for the
 * tutorial, not screenshots, is that possible?" This is the answer. It
 * supplies the SAME context `LoomProvider` does, so every tab, the PDF
 * viewer, the capture modal and the board work exactly as they really do:
 * a student really drag-selects, really names a concept, really throws a
 * thread, really drags a card. None of it is written anywhere.
 *
 * WHY A SECOND PROVIDER RATHER THAN A FLAG IN THE REAL ONE. `LoomProvider`
 * calls the server from 22 separate places, one per mutation; a flag would
 * have to be honoured at every one of them, and the failure mode of
 * forgetting is a silent write into a real student's loom. This file
 * **never imports `@/actions/loom`**, so that write cannot happen — there is
 * nothing here to call. `scripts/check-sandbox.ts` fails the build if the
 * import ever appears, and `tests/sandbox.spec.ts` asserts no write request
 * leaves the browser while a student works here.
 *
 * WHAT IS SHARED WITH PRODUCTION, DELIBERATELY. Every derivation comes from
 * `@/lib/scope` — `scopedGraph`, `asLoomState`, `scopeOf` — the same
 * functions the real provider uses. Only the transport differs: writes stop
 * at local state instead of continuing to a server. That is the whole
 * difference, and keeping it that narrow is what stops this file rotting
 * into a second, subtly different Loom.
 *
 * WHAT IS DELIBERATELY MISSING. It starts EMPTY. There was no import and no
 * worked example here even while those existed, because both bring in content
 * a student might want to keep and nothing here can be kept (see the band in
 * `SandboxWorkbench`); they were deleted outright on 2026-08-11, along with
 * the local "clear my practice" that only Keep ever rendered.
 *
 * Starting empty is a choice, not a conclusion. TJ, 2026-08-11: "i have yet to
 * see the practice loom, but i imagine we can use the worked example content
 * in it?" A practice loom that also SHOWS a worked cloth is a different and
 * probably better thing than one that only offers the gestures — see
 * docs/open-work.md. It would have to be built from the practice reading's own
 * pages, though: the deleted example was Star & Griesemer, and salting Novak &
 * Gowin's text with another book's passages would teach the wrong thing about
 * what a passage is.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { LoomContext, type LoomContextType } from "@/components/providers/LoomProvider"
import {
  scopeOf,
  scopedGraph,
  asLoomState,
  type Scope,
} from "@/lib/scope"
import { findLink } from "@/lib/linkResolve"
import type {
  CardTableView,
  Cloth,
  Concept,
  Edge,
  Link,
  LoomMap,
  LoomState,
  Passage,
  PassageTier,
  Tier,
} from "@/lib/types"

const emptyView = (): CardTableView => ({ positions: {}, bends: {} })
const blank = (): LoomState => ({
  concepts: [], passages: [], edges: [], links: [], maps: [], cloths: [],
  views: { cardTable: emptyView() },
})

const now = () => new Date()
const newId = () => crypto.randomUUID()

export default function SandboxLoomProvider({
  sourceId,
  initial,
  children,
}: {
  /** The reading being practised on — gives the sandbox a real scope, so the
   *  tabs behave exactly as they do in a real reading. */
  sourceId: string
  /**
   * The worked cloth to open with, built on the SERVER from this reading's
   * own pages (src/lib/practiceCloth.ts) and handed down as a prop — this
   * file must never read a database, which is the guarantee
   * `scripts/check-sandbox.ts` enforces. Absent, the loom opens empty.
   *
   * Seeded once, into initial state: after that it is the student's to take
   * apart. Nothing is persisted, so a refresh puts the example back — which
   * is also the "start over" this place would otherwise need a button for.
   */
  initial?: LoomState
  children: ReactNode
}) {
  const { data: session } = useSession()
  const [state, setState] = useState<LoomState>(() => initial ?? blank())
  const [flashMsg, setFlashMsg] = useState<string | null>(null)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<{ edgeId: string; from: string | null; to: string | null }[]>([])
  const [redoStack, setRedoStack] = useState<{ edgeId: string; from: string | null; to: string | null }[]>([])

  const scope: Scope = useMemo(() => scopeOf([sourceId]), [sourceId])
  const scoped = useMemo(() => scopedGraph(state, scope), [state, scope])
  const scopedState = useMemo(() => asLoomState(state, scoped), [state, scoped])

  const flashTimer = useRef<number | undefined>(undefined)
  const flash = useCallback((msg: string) => {
    setFlashMsg(msg)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashMsg(null), 1500)
  }, [])
  /** The real provider flashes "· saved ·" here. Nothing is saved in the
   *  practice loom, and saying so would be the one lie that matters — it is
   *  the same pixel the real app uses to promise persistence. */
  const noted = useCallback(() => flash("· practice ·"), [flash])

  const scopeKey = scope.key
  const uid = session?.user?.id ?? "practice"

  // --- concepts ---

  const addConcept = useCallback(async (label: string, def = "", note = "") => {
    const c: Concept = { id: newId(), courseId: null, userId: uid, label, def, note, createdAt: now() }
    setState((s) => ({ ...s, concepts: [...s.concepts, c] }))
    noted()
    return c
  }, [uid, noted])

  const editConcept = useCallback(async (id: string, data: Partial<{ label: string; def: string; note: string }>) => {
    setState((s) => ({ ...s, concepts: s.concepts.map((c) => (c.id === id ? { ...c, ...data } : c)) }))
    noted()
  }, [noted])

  /** Mirrors the real reducer: the concept goes, its passages survive with the
   *  pointer removed (a passage outliving its concept is legal — P0.1), and
   *  its threads and tiers go with it. */
  const removeConcept = useCallback(async (id: string) => {
    setState((s) => ({
      ...s,
      concepts: s.concepts.filter((c) => c.id !== id),
      passages: s.passages.map((p) => ({ ...p, conceptIds: p.conceptIds.filter((cid) => cid !== id) })),
      edges: s.edges.filter((e) => e.fromId !== id && e.toId !== id),
      maps: s.maps.map((m) => {
        if (!(id in m.tiers)) return m
        const tiers = { ...m.tiers }
        delete tiers[id]
        return { ...m, tiers }
      }),
    }))
    noted()
  }, [noted])

  const mergeConcepts = useCallback(async (sourceConceptId: string, targetId: string) => {
    setState((s) => ({
      ...s,
      concepts: s.concepts.filter((c) => c.id !== sourceConceptId),
      passages: s.passages.map((p) => (
        p.conceptIds.includes(sourceConceptId)
          ? { ...p, conceptIds: Array.from(new Set(p.conceptIds.map((cid) => (cid === sourceConceptId ? targetId : cid)))) }
          : p
      )),
      edges: s.edges
        .map((e) => ({
          ...e,
          fromId: e.fromId === sourceConceptId ? targetId : e.fromId,
          toId: e.toId === sourceConceptId ? targetId : e.toId,
        }))
        .filter((e) => e.fromId !== e.toId),
    }))
    noted()
  }, [noted])

  // --- passages ---

  const addPassage = useCallback(async (
    conceptIds: string[], source: string, location: string, content: string,
    pageNumber?: number, startOffset?: number, endOffset?: number,
    passageSourceId?: string, pageContentHash?: string, note?: string
  ) => {
    const p: Passage = {
      id: newId(), courseId: null, userId: uid,
      conceptIds, source, sourceId: passageSourceId ?? sourceId, location, content,
      pageNumber: pageNumber ?? null,
      startOffset: startOffset ?? null,
      endOffset: endOffset ?? null,
      pageContentHash: pageContentHash ?? null,
      note: note ?? "", question: "", isPullQuote: false, tier: "" as PassageTier,
      createdAt: now(),
    }
    setState((s) => ({ ...s, passages: [...s.passages, p] }))
    noted()
    return p
  }, [uid, sourceId, noted])

  const removePassage = useCallback(async (id: string) => {
    setState((s) => ({ ...s, passages: s.passages.filter((p) => p.id !== id) }))
    noted()
  }, [noted])

  const attributePassages = useCallback(async (passageIds: string[], toSourceId: string) => {
    let n = 0
    setState((s) => ({
      ...s,
      passages: s.passages.map((p) => {
        if (!passageIds.includes(p.id) || p.sourceId) return p
        n += 1
        return { ...p, sourceId: toSourceId }
      }),
    }))
    noted()
    return n
  }, [noted])

  const refilePassage = useCallback(async (passageId: string, conceptId: string) => {
    let out: Passage | null = null
    setState((s) => ({
      ...s,
      passages: s.passages.map((p) => {
        if (p.id !== passageId) return p
        out = p.conceptIds.includes(conceptId) ? p : { ...p, conceptIds: [...p.conceptIds, conceptId] }
        return out
      }),
    }))
    noted()
    return out ?? { ...blank().passages[0] } as Passage
  }, [noted])

  // Local like everything else here: the practice loom keeps nothing, so a
  // note revised in the guide lives exactly as long as the guide does.
  const editPassageNote = useCallback(async (passageId: string, note: string) => {
    setState((s) => ({
      ...s,
      passages: s.passages.map((p) => (p.id === passageId ? { ...p, note } : p)),
    }))
    noted()
  }, [noted])

  const unfilePassage = useCallback(async (passageId: string, conceptId: string) => {
    setState((s) => ({
      ...s,
      passages: s.passages.map((p) => (
        p.id === passageId ? { ...p, conceptIds: p.conceptIds.filter((c) => c !== conceptId) } : p
      )),
    }))
    noted()
  }, [noted])

  // --- cloth ---

  const activeCloth = useMemo(
    () => state.cloths.find((c) => c.scopeKey === scopeKey) ?? null,
    [state.cloths, scopeKey]
  )

  const updateCloth = useCallback(async (data: Partial<{ title: string; description: string }>, key?: string) => {
    const k = key ?? scopeKey
    setState((s) => {
      const existing = s.cloths.find((c) => c.scopeKey === k)
      if (existing) {
        return { ...s, cloths: s.cloths.map((c) => (c.scopeKey === k ? { ...c, ...data, updatedAt: now() } : c)) }
      }
      const c: Cloth = {
        id: newId(), courseId: null, userId: uid, scopeKey: k,
        title: data.title ?? "", description: data.description ?? "",
        createdAt: now(), updatedAt: now(),
      }
      return { ...s, cloths: [...s.cloths, c] }
    })
    noted()
    return true
  }, [scopeKey, uid, noted])

  // --- threads ---

  const addEdge = useCallback(async (fromId: string, toId: string, sentence: string) => {
    const e: Edge = { id: newId(), courseId: null, userId: uid, fromId, toId, handle: "", linkId: null, sentence, createdAt: now() }
    setState((s) => ({ ...s, edges: [...s.edges, e] }))
    noted()
    return e
  }, [uid, noted])

  // Typing a label coins the Link object here too, or adopts the one already
  // owned — the server does exactly this in `updateEdge`, and a practice loom
  // where coining a word leaves the Link List empty would teach the wrong
  // thing about what a label IS.
  const editEdge = useCallback(async (id: string, data: Partial<{ handle: string; sentence: string }>) => {
    setState((s) => {
      const edges = s.edges.map((e) => (e.id === id ? { ...e, ...data } : e))
      if (data.handle === undefined) return { ...s, edges }
      const label = data.handle.trim()
      if (!label) {
        return { ...s, edges: edges.map((e) => (e.id === id ? { ...e, linkId: null } : e)) }
      }
      const existing = findLink(s.links, label)
      const link: Link = existing ?? {
        id: newId(), courseId: null, userId: uid, label, description: "", createdAt: now(),
      }
      return {
        ...s,
        links: existing ? s.links : [...s.links, link],
        edges: edges.map((e) => (e.id === id ? { ...e, linkId: link.id } : e)),
      }
    })
    noted()
  }, [uid, noted])

  const removeEdge = useCallback(async (id: string) => {
    setState((s) => ({ ...s, edges: s.edges.filter((e) => e.id !== id) }))
    noted()
  }, [noted])

  // --- links (5.1) ---
  //
  // Mirrors the server's rules through the SHARED resolver so the two cannot
  // drift: coining a word already owned adopts it, an offered gloss fills an
  // empty one, and a rename fans out to the legacy handle on every thread.

  const addLink = useCallback(async (label: string, description?: string) => {
    const trimmed = label.trim()
    if (!trimmed) throw new Error("A link needs a label.")
    let out: Link | null = null
    setState((s) => {
      const existing = findLink(s.links, trimmed)
      if (existing) {
        if (description && !existing.description) {
          out = { ...existing, description }
          return { ...s, links: s.links.map((l) => (l.id === existing.id ? out! : l)) }
        }
        out = existing
        return s
      }
      out = {
        id: newId(), courseId: null, userId: uid,
        label: trimmed, description: description ?? "", createdAt: now(),
      }
      return { ...s, links: [...s.links, out] }
    })
    noted()
    return out!
  }, [uid, noted])

  const editLink = useCallback(async (id: string, data: Partial<{ label: string; description: string }>) => {
    setState((s) => ({
      ...s,
      links: s.links.map((l) => (l.id === id ? { ...l, ...data } : l)),
      edges: typeof data.label === "string"
        ? s.edges.map((e) => (e.linkId === id ? { ...e, handle: data.label! } : e))
        : s.edges,
    }))
    noted()
  }, [noted])

  const attachLink = useCallback(async (edgeId: string, linkId: string | null) => {
    setState((s) => {
      const link = linkId ? s.links.find((l) => l.id === linkId) ?? null : null
      return {
        ...s,
        edges: s.edges.map((e) => (e.id === edgeId ? { ...e, linkId, handle: link?.label ?? "" } : e)),
      }
    })
    noted()
  }, [noted])

  // --- projections ---

  const scopeMaps = useMemo(() => state.maps.filter((m) => m.scopeKey === scopeKey), [state.maps, scopeKey])
  const activeMap = useMemo(() => {
    const chosen = scopeMaps.find((m) => m.id === selectedMapId)
    if (chosen) return chosen
    if (!scopeMaps.length) return null
    return [...scopeMaps].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
  }, [scopeMaps, selectedMapId])

  const addMap = useCallback(async (name?: string) => {
    const m: LoomMap = {
      id: newId(), courseId: null, userId: uid, scopeKey,
      name: name ?? `Projection ${scopeMaps.length + 1}`,
      read: "", essence: "", tiers: {}, createdAt: now(), updatedAt: now(),
    }
    setState((s) => ({ ...s, maps: [...s.maps, m] }))
    setSelectedMapId(m.id)
    noted()
    return m
  }, [uid, scopeKey, scopeMaps.length, noted])

  const patchMap = useCallback((id: string, data: Partial<LoomMap>) => {
    setState((s) => ({ ...s, maps: s.maps.map((m) => (m.id === id ? { ...m, ...data, updatedAt: now() } : m)) }))
  }, [])

  const removeMap = useCallback(async (id: string) => {
    setState((s) => {
      const views = { ...s.views }
      delete views[`map:${id}`]
      return { ...s, maps: s.maps.filter((m) => m.id !== id), views }
    })
    noted()
  }, [noted])

  const ensureActiveMap = useCallback(async () => {
    if (activeMap) return activeMap
    return addMap()
  }, [activeMap, addMap])

  const setView = useCallback((key: string, next: CardTableView) => {
    setState((s) => ({ ...s, views: { ...s.views, [key]: next } }))
  }, [])

  const value: LoomContextType = {
    state,
    scope,
    scoped,
    scopedState,
    isLoading: false,
    studentName: session?.user?.name ?? "you",
    addConcept,
    editConcept,
    removeConcept,
    mergeConcepts,
    addPassage,
    removePassage,
    attributePassages,
    refilePassage,
    unfilePassage,
    editPassageNote,
    activeCloth,
    updateCloth,
    // Nothing is debounced here because nothing is sent anywhere; the local
    // write already happened on the keystroke, so a flush has nothing to push.
    flushCloth: () => {},
    addEdge,    editEdge,
    removeEdge,
    links: state.links,
    addLink,
    editLink,
    attachLink,
    maps: state.maps,
    scopeMaps,
    activeMap,
    selectMap: setSelectedMapId,
    addMap,
    renameMap: (id, name) => patchMap(id, { name }),
    removeMap,
    setMapTiers: async (id, tiers: Record<string, Tier>) => { patchMap(id, { tiers }); noted() },
    setMapRead: (id, read) => patchMap(id, { read }),
    setMapEssence: (id, essence) => patchMap(id, { essence }),
    // Nothing is debounced here because nothing is being sent anywhere; the
    // local write already happened on the keystroke.
    flushMapText: () => {},
    /**
     * Clearing your own practice costs nothing (contracts.md §2c) — so this is
     * a real reset of the practice loom and a call to nothing. It returns the
     * same counts shape the server action does, which is what lets this file
     * satisfy `LoomContextType` while keeping its one promise: no import of
     * `@/actions/*` (`scripts/check-sandbox.ts` fails the build otherwise).
     *
     * Nothing renders it today. The Header's My Loom modal hides start over on
     * /sandbox — the real loom's counts sitting behind a page that says
     * nothing is kept is a sentence no student should have to untangle.
     */
    resetLoom: async () => {
      const cleared = {
        concepts: state.concepts.length, passages: state.passages.length,
        edges: state.edges.length, links: state.links.length,
        maps: state.maps.length, cloths: state.cloths.length,
        views: Object.keys(state.views).length,
      }
      setState(blank())
      noted()
      return cleared
    },
    /**
     * The same act, one reading wide. The practice loom is a single reading,
     * so here it clears everything the whole-loom reset would except the
     * concepts, links and threads — which is exactly the real rule, and worth
     * behaving identically to even though nothing renders it yet.
     */
    resetReading: async () => {
      const cleared = {
        passages: state.passages.length,
        cloths: state.cloths.length,
        maps: state.maps.length,
      }
      setState((s) => ({ ...s, passages: [], cloths: [], maps: [], views: { cardTable: emptyView() } }))
      noted()
      return cleared
    },
    setView,
    ensureActiveMap,
    flashMsg,
    flash,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
  }

  return <LoomContext.Provider value={value}>{children}</LoomContext.Provider>
}
