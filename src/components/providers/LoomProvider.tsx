"use client"

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react"
import { useSession } from "next-auth/react"
import type { Byte, CardTableView, Concept, Edge, LoomState, Tier } from "@/lib/types"
import { emptyViews, parseImport } from "@/lib/graphExport"
import {
  getUserLoomData,
  createConcept, updateConcept, deleteConcept,
  createByte, deleteByte, refileByte as refileByteAction,
  createEdge, updateEdge, deleteEdge,
  saveRead, saveView,
  importGraph, resetGraph, loadWorkedExample,
} from "@/actions/loom"

interface LoomContextType {
  state: LoomState
  isLoading: boolean
  /** Signed-in student's display name — graph.student in the export contract. */
  studentName: string
  addConcept: (label: string, def?: string, note?: string) => Promise<Concept>
  editConcept: (id: string, data: Partial<{label: string, def: string, note: string, tier: Tier}>) => Promise<void>
  removeConcept: (id: string) => Promise<void>
  addByte: (conceptId: string, source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, sourceId?: string, pageContentHash?: string) => Promise<Byte>
  removeByte: (id: string) => Promise<void>
  refileByte: (byteId: string, conceptId: string) => Promise<Byte>
  addEdge: (fromId: string, toId: string, sentence: string) => Promise<Edge>
  editEdge: (id: string, data: Partial<{handle: string, sentence: string}>) => Promise<void>
  removeEdge: (id: string) => Promise<void>
  setRead: (readState: string) => void
  /** Push any pending debounced read save immediately (call on blur). */
  flushRead: () => void
  /** Persist a student gesture on the card table (drag end / bend end / clear). */
  setCardTable: (next: CardTableView) => void
  importFromText: (raw: string) => Promise<void>
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

const blankState = (): LoomState => ({ concepts: [], bytes: [], edges: [], read: "", views: emptyViews() })

export function LoomProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [state, setState] = useState<LoomState>(blankState())
  const [isLoading, setIsLoading] = useState(true)
  const [flashMsg, setFlashMsg] = useState<string | null>(null)

  const [undoStack, setUndoStack] = useState<{edgeId: string, from: string | null, to: string | null}[]>([])
  const [redoStack, setRedoStack] = useState<{edgeId: string, from: string | null, to: string | null}[]>([])

  const flashTimer = useRef<number | undefined>(undefined)
  const flash = useCallback((msg: string) => {
    setFlashMsg(msg)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashMsg(null), 1500)
  }, [])

  useEffect(() => {
    if (session?.user) {
      const startTimer = window.setTimeout(() => setIsLoading(true), 0)
      getUserLoomData().then(data => {
        setState(data)
        setIsLoading(false)
      }).catch(err => {
        console.error("Failed to load loom data", err)
        setIsLoading(false)
      })
      return () => window.clearTimeout(startTimer)
    } else {
      const resetTimer = window.setTimeout(() => {
        setState(blankState())
        setIsLoading(false)
      }, 0)
      return () => window.clearTimeout(resetTimer)
    }
  }, [session])

  // A failed edit or delete leaves optimistic state lying about the server.
  // Reload the truth and say so, instead of diverging silently.
  const resync = useCallback(async (err: unknown) => {
    console.error("Loom mutation failed", err)
    flash(err instanceof Error && err.message !== "Unauthorized" ? err.message : "could not save — reloaded")
    try {
      setState(await getUserLoomData())
    } catch (reloadErr) {
      console.error("Failed to reload loom data", reloadErr)
    }
  }, [flash])

  const addConcept = async (label: string, def?: string, note?: string) => {
    const tempId = crypto.randomUUID()
    const tempConcept: Concept = { id: tempId, courseId: null, userId: session!.user!.id, label, def: def || "", note: note || "", tier: "", createdAt: new Date() }
    setState(s => ({ ...s, concepts: [...s.concepts, tempConcept] }))
    try {
      const saved = await createConcept({ label, def, note })
      setState(s => ({ ...s, concepts: s.concepts.map(c => c.id === tempId ? saved : c) }))
      return saved
    } catch (e) {
      setState(s => ({ ...s, concepts: s.concepts.filter(c => c.id !== tempId) }))
      throw e
    }
  }

  const editConcept = async (id: string, data: Partial<{label: string, def: string, note: string, tier: Tier}>) => {
    setState(s => ({
      ...s,
      concepts: s.concepts.map(c => c.id === id ? { ...c, ...data } : c)
    }))
    try {
      await updateConcept(id, data)
    } catch (e) {
      await resync(e)
    }
  }

  const removeConcept = async (id: string) => {
    setState(s => ({
      ...s,
      concepts: s.concepts.filter(c => c.id !== id),
      bytes: s.bytes.filter(b => b.conceptId !== id),
      edges: s.edges.filter(e => e.fromId !== id && e.toId !== id),
      views: {
        cardTable: {
          positions: Object.fromEntries(Object.entries(s.views.cardTable.positions).filter(([k]) => k !== id)),
          bends: s.views.cardTable.bends,
        },
      },
    }))
    try {
      await deleteConcept(id)
    } catch (e) {
      await resync(e)
    }
  }

  const addByte = async (conceptId: string, source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, sourceId?: string, pageContentHash?: string) => {
    const tempId = crypto.randomUUID()
    const tempByte: Byte = {
      id: tempId,
      courseId: null,
      userId: session!.user!.id,
      conceptId,
      source,
      sourceId: sourceId ?? null,
      location,
      content,
      pageNumber: pageNumber ?? null,
      startOffset: startOffset ?? null,
      endOffset: endOffset ?? null,
      pageContentHash: pageContentHash ?? null,
      createdAt: new Date()
    }
    setState(s => ({ ...s, bytes: [...s.bytes, tempByte] }))
    try {
      const saved = await createByte({ conceptId, source, sourceId, location, content, pageNumber, startOffset, endOffset, pageContentHash })
      setState(s => ({ ...s, bytes: s.bytes.map(b => b.id === tempId ? saved : b) }))
      return saved
    } catch (e) {
      setState(s => ({ ...s, bytes: s.bytes.filter(b => b.id !== tempId) }))
      throw e
    }
  }

  const removeByte = async (id: string) => {
    setState(s => ({ ...s, bytes: s.bytes.filter(b => b.id !== id) }))
    try {
      await deleteByte(id)
    } catch (e) {
      await resync(e)
    }
  }

  const refileByte = async (byteId: string, conceptId: string) => {
    try {
      const saved = await refileByteAction(byteId, conceptId)
      setState(s => ({ ...s, bytes: [...s.bytes, saved] }))
      return saved
    } catch (e) {
      await resync(e)
      throw e
    }
  }

  const addEdge = async (fromId: string, toId: string, sentence: string) => {
    const tempId = crypto.randomUUID()
    const tempEdge: Edge = { id: tempId, courseId: null, userId: session!.user!.id, fromId, toId, handle: "", sentence, createdAt: new Date() }
    setState(s => ({ ...s, edges: [...s.edges, tempEdge] }))
    try {
      const saved = await createEdge({ fromId, toId, sentence })
      setState(s => ({ ...s, edges: s.edges.map(e => e.id === tempId ? saved : e) }))
      return saved
    } catch (e) {
      setState(s => ({ ...s, edges: s.edges.filter(e => e.id !== tempId) }))
      throw e
    }
  }

  const editEdge = async (id: string, data: Partial<{handle: string, sentence: string}>) => {
    setState(s => ({ ...s, edges: s.edges.map(e => e.id === id ? { ...e, ...data } : e) }))
    try {
      await updateEdge(id, data)
    } catch (e) {
      await resync(e)
    }
  }

  const removeEdge = async (id: string) => {
    setState(s => ({
      ...s,
      edges: s.edges.filter(e => e.id !== id),
      views: {
        cardTable: {
          positions: s.views.cardTable.positions,
          bends: Object.fromEntries(Object.entries(s.views.cardTable.bends).filter(([k]) => k !== id)),
        },
      },
    }))
    try {
      await deleteEdge(id)
    } catch (e) {
      await resync(e)
    }
  }

  // "Your read" persists debounced; flushRead fires the pending save (on blur)
  // so red line #5 holds against a quick tab close.
  const readTimer = useRef<number | undefined>(undefined)
  const pendingRead = useRef<string | null>(null)
  const persistRead = useCallback(() => {
    if (pendingRead.current === null) return
    const text = pendingRead.current
    pendingRead.current = null
    saveRead(text).then(() => flash("saved")).catch((e) => {
      console.error("Failed to save read", e)
      flash("read not saved — try again")
    })
  }, [flash])

  const setRead = (readState: string) => {
    setState(s => ({ ...s, read: readState }))
    pendingRead.current = readState
    window.clearTimeout(readTimer.current)
    readTimer.current = window.setTimeout(persistRead, 700)
  }

  const flushRead = useCallback(() => {
    window.clearTimeout(readTimer.current)
    persistRead()
  }, [persistRead])

  // Blur flushes inside the app; a hidden tab is the closest reliable signal
  // before a close. (A server-action fetch during full unload can still be
  // aborted by the browser — the debounce window is the residual risk.)
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushRead()
    }
    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pagehide", flushRead)
    return () => {
      document.removeEventListener("visibilitychange", onHidden)
      window.removeEventListener("pagehide", flushRead)
    }
  }, [flushRead])

  // Card-table geometry: only called from student gestures (drag end, bend end,
  // de-tier cleanup) — auto-layout stays ephemeral in the component.
  const viewTimer = useRef<number | undefined>(undefined)
  const pendingView = useRef<CardTableView | null>(null)
  const setCardTable = (next: CardTableView) => {
    setState(s => ({ ...s, views: { cardTable: next } }))
    pendingView.current = next
    window.clearTimeout(viewTimer.current)
    viewTimer.current = window.setTimeout(() => {
      const data = pendingView.current
      pendingView.current = null
      if (!data) return
      saveView("cardTable", data).catch((e) => {
        console.error("Failed to save card table view", e)
        flash("arrangement not saved — try again")
      })
    }, 500)
  }

  // A replace-the-graph operation must not race a stale debounced save: a
  // pending view/read write landing after the replacement would resurrect
  // pre-replacement state on the server.
  const cancelPendingSaves = useCallback(() => {
    window.clearTimeout(readTimer.current)
    pendingRead.current = null
    window.clearTimeout(viewTimer.current)
    pendingView.current = null
  }, [])

  const importFromText = async (raw: string) => {
    const parsed = parseImport(raw) // throws with a friendly message on bad input
    cancelPendingSaves()
    try {
      const data = await importGraph(parsed)
      setState(data)
      flash("imported")
    } catch (e) {
      // The batch is atomic server-side, but the client must not keep showing
      // a graph the server may or may not hold — reload the truth.
      try { setState(await getUserLoomData()) } catch { /* initial load error path already logs */ }
      throw e
    }
  }

  const resetAll = async () => {
    cancelPendingSaves()
    await resetGraph()
    setState(blankState())
    flash("cleared — the history of your weaving is kept")
  }

  const loadExample = async () => {
    cancelPendingSaves()
    const data = await loadWorkedExample()
    setState(data)
    flash("worked example loaded — explore it, then reset")
  }

  return (
    <LoomContext.Provider value={{
      state, isLoading,
      studentName: session?.user?.name || "",
      addConcept, editConcept, removeConcept,
      addByte, removeByte, refileByte,
      addEdge, editEdge, removeEdge,
      setRead, flushRead, setCardTable,
      importFromText, resetAll, loadExample,
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
