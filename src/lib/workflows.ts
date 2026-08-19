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
    "src/components/ui/MyLoomModal.tsx (my loom · start over)",
  ],
  nodes: [
    { id: "invited", label: "Invited by email", where: "an instructor, on /admin", kind: "start" },
    { id: "signin", label: "Sign in with GitHub", where: "the front door" },
    { id: "gate", label: "Invited, enrolled, or allowed?", where: "decideSignIn", kind: "decision" },
    { id: "refused", label: "Turned away, and told why", where: "/auth/error", kind: "denied" },
    { id: "enrol", label: "Enrolled into the course and section", where: "events.signIn" },
    { id: "library", label: "The course's readings, by week", where: "00 · Library" },
    // The practice loom is a real path a student can take, so it is drawn
    // (AGENTS.md). It is a side trip, not a step: the same workbench on a real
    // reading, wrapped in a provider that writes nothing, so nothing done here
    // reaches the arc below. It returns to the Library because that is where
    // the real work starts.
    { id: "practice", label: "Try the moves first — nothing is kept", where: "/sandbox — the real interface over a practice loom" },
    { id: "open", label: "Open a reading — the card is the door", where: "reading card → /reading/[id]; it opens your Cloth for that reading" },
    { id: "read", label: "Read the text", where: "01 · Reading" },
    { id: "ahead", label: "Or name a concept you expect, and gloss it — then read for support", where: "01 · Reading — shows as “no evidence” until a passage backs it" },
    { id: "capture", label: "Highlight a passage", where: "01 · Reading" },
    // The other doorway, and since 2026-08-13 the only place it appears: a
    // reading with NO PDF — a book, a lecture, a card the student added
    // themselves. Beside a PDF, typing is not offered at all (TJ: "lets make it
    // only visible in a reading without a pdf"), so this fork is the reading
    // having no text to select rather than a page having none.
    //
    // Drawn at all because the flow claimed "Highlight a passage" was the sole
    // way in, and on a card with no file there is nothing to highlight.
    //
    // It does NOT pass through `file`. That step is naming the concept
    // afterwards, which is a real second act for a highlight (a capture may
    // stay Unlabeled). The typed form will not submit without a concept, so
    // capturing and filing are one gesture here and the path rejoins at
    // Linking.
    { id: "typed", label: "Type the passage in", where: "01 · Reading — a reading with no PDF: a book, a lecture, a card you added yourself" },
    // Two doors to the same act since 2026-08-18. The margin card's + used to
    // open Your work and scroll to the passage; it now opens one card beside
    // the passage instead, which is the smaller act the + was always naming —
    // file THIS passage under one more concept, without leaving the text.
    // Your work is still the place to do the rest (revise the note, unfile,
    // read the whole reading's work), so both are named here rather than one
    // replacing the other.
    { id: "file", label: "Name the concept it evidences — or leave it unlabeled", where: "01 · Reading — the card beside the passage, or Your work slid out over the text" },
    { id: "link", label: "Pick two concepts, say the sentence, label the link", where: "02 · Linking" },
    // 03 before 04, in the array and in the edges below. Stations 03 and 04
    // were swapped on 2026-08-08 (TJ) — "you lay the graph out and read it, and
    // the vocabulary you have collected is what you check afterwards" — and the
    // rule that came with it is that student copy FOLLOWS THE BAR, which
    // numbers itself. This flow did not: it ran link → vocab → sort, so the
    // picture drew an arrow from a node labelled "04 · Vocabulary" into one
    // labelled "03 · Knowledge Graph" and the numbers ran backwards on screen.
    { id: "sort", label: "Sort into tiers, arrange the cards", where: "03 · Knowledge Graph" },
    // "Trace the prompts" until 2026-08-13, when TJ hid the counted-prompts
    // panel so the cloth could take the full column (ClothReflection's
    // SHOW_PROMPTS). Then "Trace the cloth" until 2026-08-18, when tracing
    // itself went behind SHOW_TRACE (75e005c, 22:21) and the cloth's click
    // became the pair. That commit did not come here, so between it and this
    // one the box named a step nobody could take — the exact rot the header of
    // this file exists to prevent, caught within the day only because the same
    // feature came back to the same drawing.
    { id: "write", label: "Pick a pair on the cloth, write the one-line and the read", where: "03 · Knowledge Graph" },
    // "merge duplicates" was the second half of this step until 2026-08-12,
    // when TJ hid the merge control pending what it means and what it costs
    // (VocabularyTab's MERGE_VISIBLE). The diagram is generated, so a step the
    // student can no longer take would simply be drawn, wrongly, forever.
    { id: "vocab", label: "Sharpen descriptions, see what recurs", where: "04 · Vocabulary" },
    { id: "overlay", label: "Compare a section, or all of them", where: "Overlays — faculty and admins only" },
    // There used to be a "weave" node here — "Every reading at once", at
    // /weave. It came out in 2026-08-09 because the diagram drew a step no
    // student could take; the route itself came out on 2026-08-11, when TJ
    // ruled the whole weave out of the app entirely ("poorly defined and not
    // supported in the course"). Nothing goes back here until the faculty and
    // the authors agree what a full weave is.
    // The terminal was "Export the cloth or a projection · Keep" until
    // 2026-08-11, when Keep was deleted and download moved to each object.
    // The step did not go away; it stopped being a place you travel to.
    { id: "keep", label: "Download your work where you made it", where: "01 cloth · 02 threads · 03 a projection", kind: "end" },
    // A side trip like `practice`, not a step: My Loom opens from the header on
    // every page, so a student can reach this from anywhere. It is drawn from
    // `keep` because that is the order the dialog itself argues for — download
    // where you made it, THEN clear — and it returns to the Library because an
    // empty loom starts again the same way a new one does.
    { id: "startover", label: "Start over — one reading, or the whole loom", where: "01 · Reading, on the cloth's own card · or My Loom in the header, on every page" },
  ],
  edges: [
    { from: "invited", to: "signin" },
    { from: "signin", to: "gate" },
    { from: "gate", to: "refused", label: "on no roster" },
    { from: "gate", to: "enrol", label: "admitted" },
    { from: "enrol", to: "library" },
    { from: "library", to: "open" },
    { from: "library", to: "practice", label: "practise" },
    { from: "practice", to: "library", label: "nothing kept", back: true },
    { from: "open", to: "read" },
    { from: "read", to: "ahead" },
    { from: "read", to: "capture" },
    { from: "read", to: "typed", label: "no PDF to select from" },
    { from: "ahead", to: "capture", label: "hunt for it" },
    { from: "capture", to: "file" },
    { from: "file", to: "capture", label: "another passage", back: true },
    { from: "file", to: "link" },
    { from: "typed", to: "link" },
    { from: "link", to: "sort" },
    { from: "sort", to: "write" },
    // BACK TO 02 FROM THE CLOTH (TJ, 2026-08-18). The picture had one arrow
    // into Linking, from filing a passage — so 02 read as a station you pass
    // through once. The cloth is where you SEE two concepts that never
    // crossed, and since today it can send that pair to the bench with both
    // ends loaded. A return, so `back`: the checker insists a back edge
    // actually run uphill, and `write` sits two rows below `link`.
    { from: "write", to: "link", label: "a pair off the cloth", back: true },
    { from: "write", to: "vocab" },
    { from: "vocab", to: "overlay" },
    // The loop lives at the END of the arc now, not in the middle of it: you go
    // back to the Library for the next text once this one's work is done.
    { from: "vocab", to: "library", label: "next reading", back: true },
    { from: "vocab", to: "keep" },
    { from: "keep", to: "startover", label: "download first" },
    { from: "startover", to: "library", label: "an empty loom", back: true },
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
    { id: "shell", label: "Enter the teaching surfaces", where: "the journey bar's staff group, from anywhere" },
    { id: "gate", label: "FACULTY on a live course?", where: "listFacultyCourseIds", kind: "decision" },
    { id: "home", label: "Returned to the shelf", where: "/", kind: "denied" },
    { id: "roster", label: "Roster — who is enrolled, who has not signed in, their counts", where: "/admin (read-only)" },
    { id: "loom", label: "Open a student's loom, read-only", where: "/admin/user/[id]" },
    { id: "cohort", label: "Cohort Graph — the section's woven concepts", where: "/admin/aggregate" },
    { id: "shut", label: "Readings and Courses stay admin's", where: "both redirect", kind: "denied" },
    { id: "own", label: "Their own reading and weaving, untouched", where: "the same bar, same click — capabilities are additive", kind: "end" },
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
    { id: "quality", label: "Good enough to quote from?", where: "extraction score — a failing or unscored reading attaches hidden", kind: "decision" },
    { id: "find", label: "Find damaged pages", where: "Repair Text · act 1" },
    { id: "readpages", label: "Read them — five models transcribe", where: "act 2 · this one costs money" },
    { id: "decide", label: "Decide — accept a transcription", where: "act 3 · a person, always" },
    { id: "writepdf", label: "Write a repaired revision", where: "act 4 · re-ingested and rescored" },
    { id: "metadata", label: "Draft and accept the metadata", where: "/admin/library" },
    { id: "schedule", label: "Add to the course and schedule by week", where: "/admin/library · /admin/courses — arrives hidden unless the score passed; Reveal publishes it" },
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
