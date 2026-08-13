/**
 * The role/capability matrix, as data (TJ, 2026-08-09: "i think we need a
 * matrix of what roles have access to. this can go in the workflows").
 *
 * THIS FILE IS THE MATRIX, on the same contract as `src/lib/workflows.ts`:
 * `/workflows` renders whatever is here, so it moves with the code or it lies.
 * `scripts/check-workflows.ts` asserts that every `gate.file` exists and that
 * every `gate.symbol` still appears in it — so a rename fails the build rather
 * than rotting the matrix quietly.
 *
 * Two rules for anyone adding a row:
 *
 * 1. **Name the gate that REFUSES, not the UI that hides.** A hidden button is
 *    not access control: a Server Function is callable directly. Where the only
 *    protection really is the UI, say so with `enforcement: "ui-only"` and a
 *    `hole` — that is a finding, and it should read like one.
 * 2. **Do not write a row you have not read.** A plausible row is worse than no
 *    row, because this is used to reason about who can see what.
 *
 * On the roles themselves: **there is no stored "Student" role.** There are two
 * independent columns — `users.role` ("USER" | "ADMIN", site-wide) and
 * `courseMemberships.role` ("LEARNER" | "FACULTY" | "INSTRUCTOR", per course).
 * A student is the *absence* of two flags: an active membership that is not
 * FACULTY, held by someone who is not an admin. Worth knowing before reading
 * any row below.
 */

/** yes = unqualified; qualified = yes, but bounded — `note` says how. */
export type Verdict = "yes" | "no" | "qualified"

export type Access = {
  verdict: Verdict
  /** Required when qualified. Keep it to a clause. */
  note?: string
}

export type Enforcement =
  /** The server refuses. The UI may hide it too; that is decoration. */
  | "server"
  /** Only the UI hides it — a direct call would succeed. A HOLE. */
  | "ui-only"
  /** Nothing to enforce: the act is client-side over data already returned. */
  | "client-side"

export type CapabilityGroup =
  | "Library" | "Reading and weaving" | "Overlays"
  | "Roster" | "Readings" | "Courses" | "Meta"

export type Capability = {
  /** Stable kebab-case id. */
  id: string
  name: string
  group: CapabilityGroup
  student: Access
  faculty: Access
  admin: Access
  /**
   * The gate that actually decides. `symbol` must appear in `file`; the line
   * is a hint only and is deliberately NOT asserted, because line numbers rot
   * on every edit and a checker that cries wolf gets switched off.
   */
  gate: { file: string; symbol: string; line?: number }
  enforcement: Enforcement
  /** Only for "ui-only": what the hole is. */
  hole?: string
  /** Spends money on a model call. Rendered with a marker. */
  costsMoney?: true
}

export const CAPABILITIES: Capability[] = [
  // --- Library ------------------------------------------------------------
  {
    id: "library-browse",
    name: "Browse the course's readings",
    group: "Library",
    student: { verdict: "yes" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/sources.ts", symbol: "getSources", line: 210 },
    enforcement: "server",
  },
  {
    id: "library-unpublished",
    name: "See unpublished (staged) readings",
    group: "Library",
    student: { verdict: "no" },
    faculty: { verdict: "no", note: "staging is admin's, even in their own course" },
    admin: { verdict: "qualified", note: "hidden while wearing the student lens" },
    gate: { file: "src/actions/sources.ts", symbol: "getSources", line: 222 },
    enforcement: "server",
  },
  {
    id: "reading-open",
    name: "Open a reading's file",
    group: "Library",
    student: { verdict: "qualified", note: "readings of their course, plus their own uploads" },
    faculty: { verdict: "qualified", note: "the same as a student — not widened by the role" },
    admin: { verdict: "yes" },
    gate: { file: "src/actions/sources.ts", symbol: "authorizeSourceAccess", line: 877 },
    enforcement: "server",
  },
  {
    id: "reading-add-own",
    name: "Add a reading of your own",
    group: "Library",
    student: { verdict: "yes" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/sources.ts", symbol: "createOwnReading" },
    enforcement: "server",
  },

  // --- Reading and weaving — the student workspace ------------------------
  {
    id: "capture-passage",
    name: "Capture a passage",
    group: "Reading and weaving",
    student: { verdict: "yes" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/loom.ts", symbol: "createPassage", line: 319 },
    enforcement: "server",
  },
  {
    id: "weave-own",
    name: "Concepts, links, projections, the cloth",
    group: "Reading and weaving",
    student: { verdict: "yes" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/loom.ts", symbol: "getUserId", line: 17 },
    enforcement: "server",
  },
  {
    id: "object-download",
    name: "Download your work — the cloth, its threads, a projection, your vocabulary, the log",
    group: "Reading and weaving",
    student: { verdict: "yes" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    // Every download is built in the browser from the loom this read returns,
    // so the gate that matters is the one on reading your own rows. There is
    // no export endpoint to gate. Import and reset were here until
    // 2026-08-11 and no longer exist at all.
    gate: { file: "src/actions/loom.ts", symbol: "getUserLoomData" },
    enforcement: "server",
  },
  {
    id: "loom-reset",
    name: "Start over — clear your own loom",
    group: "Reading and weaving",
    // Everyone weaves here, so everyone can start over in their own work.
    // Withholding the exit from any of the three would only mean asking
    // somebody else to perform it, which is the row below.
    student: { verdict: "yes" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/loom.ts", symbol: "resetLoom" },
    enforcement: "server",
  },
  {
    id: "reading-reset",
    name: "Start one reading over — its captures, its cloth, its projections",
    group: "Reading and weaving",
    // Same verdicts as the whole-loom exit, and the same reason. The narrower
    // act takes a sourceId — WHICH reading — and still no userId, WHOSE; the
    // reading is additionally checked by `authorizeSourceAccess`, the gate the
    // viewer already uses, so a forged id reaches nothing new.
    student: { verdict: "yes" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/loom.ts", symbol: "resetReading" },
    enforcement: "server",
  },
  {
    id: "loom-reset-other",
    name: "Clear somebody else's loom",
    group: "Reading and weaving",
    // The row exists to say NO in a place where the answer would otherwise be
    // assumed from the admin column above it. `resetLoom` takes no userId: it
    // reads the session and scopes on that alone, so this is not a check that
    // could be forgotten but a thing the function cannot express. Neither does
    // `resetReading`, which takes WHICH reading and never WHOSE. Faculty can
    // READ a student's loom (`student-loom-read`) and that is where it stops.
    student: { verdict: "no" },
    faculty: { verdict: "no", note: "read-only over a student's loom, always" },
    admin: { verdict: "no", note: "no admin surface deletes a student's work" },
    gate: { file: "src/actions/loom.ts", symbol: "getUserId" },
    enforcement: "server",
  },

  // --- Overlays — the inverted one ----------------------------------------
  {
    id: "overlay-passages",
    name: "Passages Overlay — where a section marked",
    group: "Overlays",
    student: { verdict: "no", note: "ruled 2026-08-08: students never meet them" },
    faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/overlays.ts", symbol: "overlayViewer", line: 107 },
    enforcement: "server",
  },
  {
    id: "overlay-vocabulary",
    name: "Vocabulary Overlay — what others named",
    group: "Overlays",
    student: { verdict: "no" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/overlays.ts", symbol: "overlayViewer", line: 107 },
    enforcement: "server",
  },
  {
    id: "overlay-peer",
    name: "Count as a peer in someone's overlay",
    group: "Overlays",
    student: { verdict: "yes", note: "learners are the bands; never named, only counted" },
    faculty: { verdict: "no", note: "an exemplar cloth read as 'your cohort' would pre-code the text" },
    admin: { verdict: "no" },
    gate: { file: "src/actions/overlays.ts", symbol: "peersOf", line: 133 },
    enforcement: "server",
  },

  // --- Roster --------------------------------------------------------------
  {
    id: "roster-read",
    name: "Read the roster",
    group: "Roster",
    student: { verdict: "no" },
    faculty: { verdict: "qualified", note: "their own courses; read-only, no write controls drawn" },
    admin: { verdict: "yes" },
    gate: { file: "src/actions/admin.ts", symbol: "checkCourseFaculty", line: 79 },
    enforcement: "server",
  },
  {
    id: "roster-invite",
    name: "Invite, place in a section, remove",
    group: "Roster",
    student: { verdict: "no" }, faculty: { verdict: "no" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/admin.ts", symbol: "checkAdmin", line: 12 },
    enforcement: "server",
  },
  {
    id: "roster-make-faculty",
    name: "Make faculty / return to learner",
    group: "Roster",
    student: { verdict: "no" }, faculty: { verdict: "no" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/admin.ts", symbol: "setMemberRole" },
    enforcement: "server",
  },
  {
    id: "student-loom-read",
    name: "Open a student's loom, read-only",
    group: "Roster",
    student: { verdict: "no" },
    faculty: { verdict: "qualified", note: "students of their own courses" },
    admin: { verdict: "yes" },
    gate: { file: "src/actions/admin.ts", symbol: "getUserLoomDataAsAdmin", line: 473 },
    enforcement: "server",
  },
  {
    id: "cohort-graph",
    name: "Cohort Graph — the section's woven concepts",
    group: "Roster",
    student: { verdict: "no" }, faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/admin.ts", symbol: "getStaffViewer" },
    enforcement: "server",
  },

  // --- Readings (the write side) ------------------------------------------
  {
    id: "readings-upload",
    name: "Upload, archive, assign and schedule readings",
    group: "Readings",
    student: { verdict: "no" },
    faculty: { verdict: "no", note: "the write surfaces redirect rather than erroring" },
    admin: { verdict: "yes" },
    gate: { file: "src/actions/sources.ts", symbol: "requireAdmin" },
    enforcement: "server",
  },
  {
    id: "readings-repair",
    name: "Repair Text — five models transcribe a damaged page",
    group: "Readings",
    student: { verdict: "no" }, faculty: { verdict: "no" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/repairs.ts", symbol: "requireAdmin" },
    enforcement: "server",
    costsMoney: true,
  },

  // --- Courses -------------------------------------------------------------
  {
    id: "courses-manage",
    name: "Create courses, sections and the Faculty Section",
    group: "Courses",
    student: { verdict: "no" }, faculty: { verdict: "no" }, admin: { verdict: "yes" },
    gate: { file: "src/actions/courses.ts", symbol: "requireAdmin", line: 13 },
    enforcement: "server",
  },

  // --- Meta ----------------------------------------------------------------
  {
    id: "workflows-all",
    name: "Read all three workflows, not only your own",
    group: "Meta",
    student: { verdict: "no", note: "they read their own flow; the other two describe surfaces they cannot reach" },
    faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/app/workflows/page.tsx", symbol: "isStaff" },
    enforcement: "server",
  },
  {
    id: "view-as-student",
    name: "View as student — the lens",
    group: "Meta",
    student: { verdict: "no", note: "nothing to mask; setting the cookie by hand gains nothing" },
    faculty: { verdict: "yes" }, admin: { verdict: "yes" },
    gate: { file: "src/lib/viewAsServer.ts", symbol: "viewingAsStudent" },
    enforcement: "server",
  },
]

/**
 * Known gaps, stated rather than implied. Rendered under the matrix, because a
 * matrix that shows only what is governed reads as a claim that everything is.
 */
export const MATRIX_NOTES: string[] = [
  "There is no stored \"Student\" role. A student is an active course membership that is not FACULTY, held by someone who is not a site admin.",
  "`INSTRUCTOR` is a third membership role, written when an admin enrols by invitation. No gate reads it — it passes every check by being an admin instead. It is why `peersOf` now matches LEARNER positively rather than excluding FACULTY.",
  "Faculty are not admins for readings: they cannot see or open a staged reading, even in their own course. The model doc's §4 describes Library as one \"Admin/Faculty\" view; the build does not.",
  "Removal is thorough — `removedAt` is checked by sign-in, course resolution, the faculty list, the roster gates, file access, and both overlay bands.",
]
