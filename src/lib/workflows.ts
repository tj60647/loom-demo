/**
 * The three workflows, as data — student, faculty, admin.
 *
 * THIS FILE IS THE DIAGRAM. `/admin/workflows` renders whatever is here, so a
 * refactor that changes how someone moves through Loom is not finished until
 * the flow below says so. Nothing is hand-drawn: adding a step is adding a
 * node and an edge, and the layout re-flows itself.
 *
 * Keep it honest about the build, not the aspiration. Every `where` names a
 * real surface, and each flow's `sources` list points at the code that
 * implements it, so the next person can check the picture against the thing.
 * Where the model and the build disagree, this describes the BUILD — the
 * diagram is for people operating the system, and a flow chart that quietly
 * documents an intention is worse than none.
 */

export type FlowNodeKind =
  /** Where the actor comes in. */
  | "start"
  /** A thing the actor does. */
  | "step"
  /** A fork the system decides. */
  | "decision"
  /** A terminal the actor is aiming at. */
  | "end"
  /** A door that is closed to this actor — drawn quiet and dashed. */
  | "denied"

export type FlowNode = {
  id: string
  label: string
  /** The surface it happens on: a route, a tab, or a panel. */
  where?: string
  kind?: FlowNodeKind
}

export type FlowEdge = {
  from: string
  to: string
  /** The condition, when there is one. Keep it to a few words. */
  label?: string
  /** A loop or return. Excluded from layout depth and drawn dashed. */
  back?: boolean
}

export type Flow = {
  key: string
  /** The actor, as the tab names them. */
  title: string
  /** One sentence: what this person is trying to do. */
  blurb: string
  /** The code behind this flow — update these together. */
  sources: string[]
  nodes: FlowNode[]
  edges: FlowEdge[]
}

const student: Flow = {
  key: "student",
  title: "Student",
  blurb:
    "Reads the course's texts, captures passages, and weaves them into concepts, links and a read of their own.",
  sources: [
    "src/lib/auth.ts (sign-in + enrolment)",
    "src/components/Workbench.tsx (the tabs)",
    "src/components/tabs/*.tsx",
    "src/actions/loom.ts",
  ],
  nodes: [
    { id: "invited", label: "Invited by email", where: "an instructor, on /admin", kind: "start" },
    { id: "signin", label: "Sign in with GitHub", where: "the front door" },
    { id: "gate", label: "Invited, enrolled, or allowed?", where: "decideSignIn", kind: "decision" },
    { id: "refused", label: "Turned away, and told why", where: "/auth/error", kind: "denied" },
    { id: "enrol", label: "Enrolled into the course and section", where: "events.signIn" },
    { id: "library", label: "The course's readings, by week", where: "00 · Library" },
    { id: "open", label: "Open a reading", where: "reading card → /reading/[id]" },
    { id: "cloth", label: "Create or open a Cloth", where: "the reading card (explicit)" },
    { id: "read", label: "Read the text", where: "01 · Reading" },
    { id: "ahead", label: "Or name a concept you expect, and gloss it — then read for support", where: "01 · Reading — shows as “no evidence” until a passage backs it" },
    { id: "capture", label: "Highlight a passage", where: "01 · Reading" },
    { id: "file", label: "Name the concept it evidences — or leave it unlabeled", where: "01 · Reading — the capture log, beside the text" },
    { id: "link", label: "Pick two concepts, say the sentence, coin a label", where: "02 · Linking" },
    { id: "vocab", label: "Sharpen descriptions, merge duplicates", where: "03 · Vocabulary" },
    { id: "overlay", label: "Compare with your section or cohort", where: "Overlays — only once you have coded it yourself" },
    { id: "sort", label: "Sort into tiers, arrange the cards", where: "04 · Knowledge Graph" },
    { id: "write", label: "Trace the prompts, write the one-line and the read", where: "04 · Knowledge Graph" },
    { id: "weave", label: "Every reading at once", where: "/weave — station hidden, reached from Keep" },
    { id: "keep", label: "Export the cloth or a projection", where: "Keep", kind: "end" },
  ],
  edges: [
    { from: "invited", to: "signin" },
    { from: "signin", to: "gate" },
    { from: "gate", to: "refused", label: "on no roster" },
    { from: "gate", to: "enrol", label: "admitted" },
    { from: "enrol", to: "library" },
    { from: "library", to: "open" },
    { from: "open", to: "cloth" },
    { from: "open", to: "read", label: "or just read" },
    { from: "cloth", to: "read" },
    { from: "read", to: "ahead" },
    { from: "read", to: "capture" },
    { from: "ahead", to: "capture", label: "hunt for it" },
    { from: "capture", to: "file" },
    { from: "file", to: "capture", label: "another passage", back: true },
    { from: "file", to: "link" },
    { from: "link", to: "vocab" },
    { from: "vocab", to: "overlay" },
    { from: "vocab", to: "sort" },
    { from: "sort", to: "write" },
    { from: "write", to: "library", label: "next reading", back: true },
    { from: "write", to: "weave" },
    { from: "weave", to: "keep" },
  ],
}

const faculty: Flow = {
  key: "faculty",
  title: "Faculty",
  blurb:
    "Holds the read side of their own course — the roster, a student's loom, the cohort graph — and keeps a learner workspace of their own.",
  sources: [
    "src/lib/auth.ts (Faculty-Section invitations)",
    "src/app/admin/layout.tsx (the shell gate)",
    "src/actions/admin.ts (getStaffViewer, checkCourseFaculty)",
    "tests/faculty.spec.ts",
  ],
  nodes: [
    { id: "invited", label: "Invited to the course's Faculty Section", where: "an admin, on /admin", kind: "start" },
    { id: "promoted", label: "Or promoted from the roster", where: "/admin · Make faculty", kind: "start" },
    { id: "signin", label: "Sign in with GitHub", where: "the front door" },
    { id: "enrolfac", label: "Membership carries role FACULTY", where: "events.signIn — fresh enrolment only" },
    { id: "shell", label: "Enter the admin shell", where: "/admin" },
    { id: "gate", label: "FACULTY on a live course?", where: "listFacultyCourseIds", kind: "decision" },
    { id: "home", label: "Returned to the shelf", where: "/", kind: "denied" },
    { id: "roster", label: "Roster — who is enrolled, who has not signed in, their counts", where: "/admin (read-only)" },
    { id: "loom", label: "Open a student's loom, read-only", where: "/admin/user/[id]" },
    { id: "cohort", label: "Cohort Graph — the section's woven concepts", where: "/admin/aggregate" },
    { id: "shut", label: "Readings and Courses stay admin's", where: "both redirect", kind: "denied" },
    { id: "own", label: "Their own reading and weaving, untouched", where: "00 · Library — capabilities are additive", kind: "end" },
  ],
  edges: [
    { from: "invited", to: "signin" },
    { from: "promoted", to: "signin" },
    { from: "signin", to: "enrolfac" },
    { from: "enrolfac", to: "shell" },
    { from: "shell", to: "gate" },
    { from: "gate", to: "home", label: "no" },
    { from: "gate", to: "roster", label: "their course only" },
    { from: "roster", to: "loom" },
    { from: "roster", to: "cohort" },
    { from: "roster", to: "shut", label: "if they try" },
    { from: "cohort", to: "own" },
    { from: "loom", to: "roster", label: "back to the list", back: true },
  ],
}

const admin: Flow = {
  key: "admin",
  title: "Admin",
  blurb:
    "Builds the course: its sections and schedule, the shared library of readings, and the roster of people in it.",
  sources: [
    "src/app/admin/courses/page.tsx",
    "src/app/admin/library/page.tsx",
    "src/actions/sources.ts · src/actions/courses.ts · src/actions/admin.ts",
    "src/components/library/RepairPanel.tsx",
  ],
  nodes: [
    { id: "signin", label: "Sign in as a site ADMIN", where: "the front door", kind: "start" },
    { id: "course", label: "Create the course, its sections and its Faculty Section", where: "/admin/courses" },
    { id: "upload", label: "Upload readings", where: "/admin/library" },
    { id: "ingest", label: "Ingest, extract the text, score it", where: "automatic on upload" },
    { id: "quality", label: "Good enough to quote from?", where: "extraction score — advisory, never blocking", kind: "decision" },
    { id: "find", label: "Find damaged pages", where: "Repair Text · act 1" },
    { id: "readpages", label: "Read them — five models transcribe", where: "act 2 · this one costs money" },
    { id: "decide", label: "Decide — accept a transcription", where: "act 3 · a person, always" },
    { id: "writepdf", label: "Write a repaired revision", where: "act 4 · re-ingested and rescored" },
    { id: "metadata", label: "Draft and accept the metadata", where: "/admin/library" },
    { id: "schedule", label: "Add to the course and schedule by week", where: "/admin/library · /admin/courses" },
    { id: "invite", label: "Invite learners in bulk — one email per line, optionally with a section", where: "/admin" },
    { id: "place", label: "Place them, promote faculty, remove", where: "/admin · removal is soft, work survives" },
    { id: "watch", label: "Roster · a student's loom · Cohort Graph", where: "/admin · /admin/aggregate", kind: "end" },
  ],
  edges: [
    { from: "signin", to: "course" },
    { from: "course", to: "upload" },
    { from: "upload", to: "ingest" },
    { from: "ingest", to: "quality" },
    { from: "quality", to: "find", label: "damaged" },
    { from: "quality", to: "metadata", label: "clean" },
    { from: "find", to: "readpages" },
    { from: "readpages", to: "decide" },
    { from: "decide", to: "writepdf", label: "accepted" },
    { from: "writepdf", to: "quality", label: "re-scored", back: true },
    { from: "metadata", to: "schedule" },
    { from: "schedule", to: "invite" },
    { from: "invite", to: "place" },
    { from: "place", to: "watch" },
    { from: "watch", to: "upload", label: "next week's reading", back: true },
  ],
}

export const FLOWS: Flow[] = [student, faculty, admin]

export function flowByKey(key: string | null | undefined): Flow {
  return FLOWS.find((f) => f.key === key) ?? FLOWS[0]
}

/**
 * The flow as Mermaid source, for pasting into a doc or a PR.
 *
 * Deliberately derived rather than stored: a Mermaid block kept by hand beside
 * the data would be a second copy to forget to update, which is the failure
 * this whole file exists to prevent.
 */
export function toMermaid(flow: Flow): string {
  const safe = (s: string) => s.replace(/"/g, "'")
  const shape = (node: FlowNode) => {
    const text = `"${safe(node.label)}"`
    switch (node.kind) {
      case "decision": return `{${text}}`
      case "start":
      case "end": return `([${text}])`
      default: return `[${text}]`
    }
  }
  const lines = [`flowchart TD`]
  for (const node of flow.nodes) lines.push(`  ${node.id}${shape(node)}`)
  for (const edge of flow.edges) {
    const arrow = edge.back ? "-.->" : "-->"
    lines.push(
      edge.label
        ? `  ${edge.from} ${arrow}|"${safe(edge.label)}"| ${edge.to}`
        : `  ${edge.from} ${arrow} ${edge.to}`
    )
  }
  return lines.join("\n")
}
