export type Concept = {
  id: string
  userId: string
  label: string
  def: string | null
  note: string | null
  createdAt: Date
}

export type Byte = {
  id: string
  userId: string
  conceptId: string
  source: string | null
  location: string | null
  content: string
  createdAt: Date
}

export type Edge = {
  id: string
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
