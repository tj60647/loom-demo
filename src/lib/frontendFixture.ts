import type { LoomState } from "@/lib/types"
import type { ReadingMeta } from "@/components/providers/ReadingsProvider"

const now = new Date("2026-08-20T12:00:00Z")
const userId = "stageit-designer"

export const frontendReadings: ReadingMeta[] = [
  { id: "star", title: "This Is Not a Boundary Object", author: "Susan Leigh Star", sourceReference: "Star (2010)", description: "A short intervention on how shared things coordinate different social worlds.", isDescriptionVisible: true, week: 2, isOwn: false, storageKey: null },
  { id: "wenger", title: "Communities of Practice", author: "Etienne Wenger", sourceReference: "Wenger (1998)", description: "How learning lives in participation, practice, and a shared repertoire.", isDescriptionVisible: true, week: 3, isOwn: false, storageKey: null },
]

export const frontendState = (): LoomState => ({
  concepts: [
    { id: "boundary", courseId: null, userId, label: "boundary object", def: "a thing that coordinates people without requiring the same meaning", note: "", tier: "", createdAt: now },
    { id: "translation", courseId: null, userId, label: "translation", def: "the work of making an idea travel between worlds", note: "", tier: "", createdAt: now },
    { id: "infrastructure", courseId: null, userId, label: "infrastructure", def: "the quiet arrangements that make coordination possible", note: "", tier: "", createdAt: now },
  ],
  bytes: [
    { id: "byte-boundary", courseId: null, userId, conceptId: "boundary", source: "Susan Leigh Star, This Is Not a Boundary Object", sourceId: "star", location: "p. 602", content: "Boundary objects are both plastic enough to adapt to local needs and constraints, yet robust enough to maintain a common identity across sites.", pageNumber: null, startOffset: null, endOffset: null, pageContentHash: null, createdAt: now },
    { id: "byte-translation", courseId: null, userId, conceptId: "translation", source: "Susan Leigh Star, This Is Not a Boundary Object", sourceId: "star", location: "p. 603", content: "The work is not consensus but coordination across different social worlds.", pageNumber: null, startOffset: null, endOffset: null, pageContentHash: null, createdAt: now },
    { id: "byte-infrastructure", courseId: null, userId, conceptId: "infrastructure", source: "Etienne Wenger, Communities of Practice", sourceId: "wenger", location: "p. 47", content: "Practice is sustained by arrangements that become visible when they fail.", pageNumber: null, startOffset: null, endOffset: null, pageContentHash: null, createdAt: now },
  ],
  edges: [
    { id: "thread-1", courseId: null, userId, fromId: "boundary", toId: "translation", handle: "makes room for", sentence: "A boundary object makes room for translation without settling every difference.", createdAt: now },
    { id: "thread-2", courseId: null, userId, fromId: "translation", toId: "infrastructure", handle: "depends on", sentence: "Translation depends on infrastructure that can carry it.", createdAt: now },
  ],
  maps: [{ id: "map-weave", courseId: null, userId, scopeKey: "", name: "Map 1", essence: "Coordination holds difference without resolving it.", read: "The concepts describe how people work across different worlds: shared objects make translation possible, while infrastructure carries that work.", tiers: { boundary: "p", translation: "s", infrastructure: "t" }, createdAt: now, updatedAt: now }],
  read: "The concepts describe how people work across different worlds: shared objects make translation possible, while infrastructure carries that work.",
  views: { cardTable: { positions: {}, bends: {} }, "map:map-weave": { positions: {}, bends: {} } },
})

export const frontendStudent = { id: userId, name: "Interface Designer", email: "designer@loom.local", role: "student", isAdmin: false }
