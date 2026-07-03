"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useSession } from "next-auth/react"
import type { Concept, Byte, Edge, LoomState } from "@/lib/types"
import { getUserLoomData, createConcept, updateConcept, deleteConcept, createByte, deleteByte, createEdge, updateEdge, deleteEdge } from "@/actions/loom"

interface LoomContextType {
  state: LoomState
  isLoading: boolean
  addConcept: (label: string, def?: string, note?: string) => Promise<Concept>
  editConcept: (id: string, data: Partial<{label: string, def: string, note: string}>) => Promise<void>
  removeConcept: (id: string) => Promise<void>
  addByte: (conceptId: string, source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, sourceId?: string, pageContentHash?: string) => Promise<Byte>
  removeByte: (id: string) => Promise<void>
  addEdge: (fromId: string, toId: string, sentence: string) => Promise<Edge>
  editEdge: (id: string, data: Partial<{handle: string, sentence: string}>) => Promise<void>
  removeEdge: (id: string) => Promise<void>
  setRead: (readState: string) => void
  undoStack: {edgeId: string, from: string | null, to: string | null}[]
  setUndoStack: React.Dispatch<React.SetStateAction<{edgeId: string, from: string | null, to: string | null}[]>>
  redoStack: {edgeId: string, from: string | null, to: string | null}[]
  setRedoStack: React.Dispatch<React.SetStateAction<{edgeId: string, from: string | null, to: string | null}[]>>
}

const LoomContext = createContext<LoomContextType | null>(null)

export function LoomProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [state, setState] = useState<LoomState>({ concepts: [], bytes: [], edges: [], read: "" })
  const [isLoading, setIsLoading] = useState(true)
  
  const [undoStack, setUndoStack] = useState<{edgeId: string, from: string | null, to: string | null}[]>([])
  const [redoStack, setRedoStack] = useState<{edgeId: string, from: string | null, to: string | null}[]>([])

  useEffect(() => {
    if (session?.user) {
      setIsLoading(true)
      getUserLoomData().then(data => {
        setState({ ...data, read: "" })
        setIsLoading(false)
      }).catch(err => {
        console.error("Failed to load loom data", err)
        setIsLoading(false)
      })
    } else {
      setState({ concepts: [], bytes: [], edges: [], read: "" })
      setIsLoading(false)
    }
  }, [session])

  const addConcept = async (label: string, def?: string, note?: string) => {
    const tempId = crypto.randomUUID()
    const tempConcept: Concept = { id: tempId, userId: session!.user!.id, label, def: def || "", note: note || "", createdAt: new Date() }
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

  const editConcept = async (id: string, data: Partial<{label: string, def: string, note: string}>) => {
    setState(s => ({
      ...s,
      concepts: s.concepts.map(c => c.id === id ? { ...c, ...data } : c)
    }))
    await updateConcept(id, data)
  }

  const removeConcept = async (id: string) => {
    setState(s => ({
      ...s,
      concepts: s.concepts.filter(c => c.id !== id),
      bytes: s.bytes.filter(b => b.conceptId !== id),
      edges: s.edges.filter(e => e.fromId !== id && e.toId !== id)
    }))
    await deleteConcept(id)
  }

  const addByte = async (conceptId: string, source: string, location: string, content: string, pageNumber?: number, startOffset?: number, endOffset?: number, sourceId?: string, pageContentHash?: string) => {
    const tempId = crypto.randomUUID()
    const tempByte: Byte = { 
      id: tempId, 
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
    await deleteByte(id)
  }

  const addEdge = async (fromId: string, toId: string, sentence: string) => {
    const tempId = crypto.randomUUID()
    const tempEdge: Edge = { id: tempId, userId: session!.user!.id, fromId, toId, handle: "", sentence, createdAt: new Date() }
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
    await updateEdge(id, data)
  }

  const removeEdge = async (id: string) => {
    setState(s => ({ ...s, edges: s.edges.filter(e => e.id !== id) }))
    await deleteEdge(id)
  }

  const setRead = (readState: string) => {
    setState(s => ({ ...s, read: readState }))
  }

  return (
    <LoomContext.Provider value={{
      state, isLoading,
      addConcept, editConcept, removeConcept,
      addByte, removeByte,
      addEdge, editEdge, removeEdge,
      setRead,
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
