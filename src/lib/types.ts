export type Concept = {
  id: string
  courseId: string | null
  userId: string
  label: string
  def: string | null
  note: string | null
  createdAt: Date
}

export type Byte = {
  id: string
  courseId: string | null
  userId: string
  conceptId: string
  source: string | null
  sourceId: string | null
  location: string | null
  content: string
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
  pageContentHash: string | null
  createdAt: Date
}

// A reading in the shared library. Course-specific facts (published? which
// week?) live on course_source, not here — see LibrarySource below for the
// shape the learner-facing library returns.
export type Source = {
  id: string
  title: string
  author: string | null
  sourceReference: string | null
  description: string | null
  isDescriptionVisible: boolean
  metadataProvenance: string | null
  isArchived: boolean
  storageKey: string
  createdByUserId: string | null
  createdAt: Date
}

/** A library reading as seen from inside one course. */
export type CourseSourceLink = {
  courseId: string
  sourceId: string
  isVisible: boolean
  week: number | null
  isCore: boolean
  position: number
  createdAt: Date
}

export type Edge = {
  id: string
  courseId: string | null
  userId: string
  fromId: string
  toId: string
  handle: string | null
  sentence: string
  createdAt: Date
}

export type LoomState = {
  concepts: Concept[]
  bytes: Byte[]
  edges: Edge[]
  read: string
}
