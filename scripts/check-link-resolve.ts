/**
 * Resolving a Link, asserted without a browser.
 *
 * `src/lib/linkResolve.ts` is shared by the server and BOTH providers — the
 * real one and the practice loom's, which cannot call the server. That is
 * deliberate: a second implementation is how the two would drift. So the
 * rules are pinned here rather than in any one caller.
 *
 * The failures that matter are silent. Minting a second Link for a label the
 * student already owns looks like nothing until their vocabulary is full of
 * near-duplicates — the exact rot the design note says would make the list
 * worthless. Under-counting uses hides work. Neither throws.
 *
 * Run: npx tsx scripts/check-link-resolve.ts   (part of `npm run check`)
 */
import { findLink, labelOf, normLabel, unresolvedLabelled, usesOf } from "../src/lib/linkResolve"
import type { Edge, Link } from "../src/lib/types"

let failures = 0
let checks = 0

function ok(label: string) {
  checks++
  console.log(`  ok    ${label}`)
}

function fail(label: string, detail: string) {
  checks++
  failures++
  console.log(`  FAIL  ${label}\n        ${detail}`)
}

function assert(condition: boolean, label: string, detail: string) {
  if (condition) ok(label)
  else fail(label, detail)
}

const day = (n: number) => new Date(`2026-08-${String(n).padStart(2, "0")}T00:00:00Z`)

const link = (id: string, label: string, on = 1, description = ""): Link => ({
  id, courseId: null, userId: "u", label, description, createdAt: day(on),
})
const edge = (id: string, linkId: string | null, handle: string | null): Edge => ({
  id, courseId: null, userId: "u", fromId: "a", toId: "b", handle, linkId,
  sentence: "", createdAt: day(1),
})

console.log("\nlink resolve — one label, one object")

// --- the comparison key ---
assert(normLabel("  Leads To  ") === "leads to", "the key trims and folds case", normLabel("  Leads To  "))
assert(normLabel("   ") === "", "whitespace alone is no label", `"${normLabel("   ")}"`)

// --- finding what the student already owns ---
{
  const links = [link("l1", "leads to")]
  assert(findLink(links, "Leads To")?.id === "l1", "a label already owned is FOUND, not minted again", "case-insensitive match failed")
  assert(findLink(links, "  leads to ")?.id === "l1", "surrounding space does not mint a twin", "trim failed")
  assert(findLink(links, "depends on") === undefined, "a genuinely new label finds nothing", "matched the wrong link")
  assert(findLink(links, "   ") === undefined, "an empty label resolves to nothing", "empty matched something")
}

// Homonyms are legal (ruling 36) — so more than one row CAN match, and the
// tie-break must be stable or two readers disagree about the same loom.
{
  const links = [link("late", "leads to", 9), link("early", "Leads to", 3)]
  assert(findLink(links, "leads to")?.id === "early", "the EARLIEST coined homonym wins", findLink(links, "leads to")?.id ?? "none")
  const sameDay = [link("b", "x", 5), link("a", "X", 5)]
  assert(findLink(sameDay, "x")?.id === "a", "a same-instant tie breaks deterministically by id", findLink(sameDay, "x")?.id ?? "none")
}

// --- what a thread is labelled ---
{
  const links = [link("l1", "constrains")]
  assert(labelOf(edge("e1", "l1", "stale copy"), links) === "constrains",
    "the OBJECT wins over the legacy string — a rename reaches every thread", "fell back to handle")
  assert(labelOf(edge("e2", null, "coined before 0024"), links) === "coined before 0024",
    "an unmigrated thread still reads its handle", "lost the legacy label")
  assert(labelOf(edge("e3", "gone", "orphan copy"), links) === "orphan copy",
    "a dangling linkId falls back rather than rendering blank", "rendered nothing")
  assert(labelOf(edge("e4", null, null), links) === "", "an unlabelled thread is empty, not undefined", "not a string")
}

// --- uses, including none ---
{
  const links = [link("l1", "constrains"), link("l2", "never used")]
  const edges = [edge("e1", "l1", "constrains"), edge("e2", null, "Constrains"), edge("e3", null, null)]
  const uses = usesOf(links, edges)
  assert(uses.get("l1")!.length === 2,
    "a thread still carrying only a handle counts toward its Link — seeded and pre-0024 rows are the student's work too",
    `got ${uses.get("l1")!.length}`)
  assert(uses.has("l2") && uses.get("l2")!.length === 0,
    "a Link with NO thread is present with zero — TJ's case is a row, not an absence",
    "the unused link vanished from the map")
  assert([...uses.values()].flat().every((e) => e.id !== "e3"), "an unlabelled thread counts toward nothing", "counted a bare thread")
}

// A homonym pair must not double-count the same handle.
{
  const links = [link("early", "leads to", 3), link("late", "Leads To", 9)]
  const uses = usesOf(links, [edge("e1", null, "leads to")])
  assert(uses.get("early")!.length === 1 && uses.get("late")!.length === 0,
    "a handle-only thread attaches to the earliest homonym, once",
    JSON.stringify([uses.get("early")!.length, uses.get("late")!.length]))
}

// --- the leak detector ---
{
  const links = [link("l1", "constrains")]
  assert(unresolvedLabelled(links, [edge("e1", null, "constrains")]).length === 0,
    "a handle matching a known Link is not unresolved", "false positive")
  assert(unresolvedLabelled(links, [edge("e2", null, "orphaned word")]).length === 1,
    "a labelled thread whose word no Link owns IS unresolved — the state 5.1c's drop must reach zero",
    "missed an orphan")
  assert(unresolvedLabelled(links, [edge("e3", null, "")]).length === 0, "a bare thread is not an orphan", "counted a bare thread")
}

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
