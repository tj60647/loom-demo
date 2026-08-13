/**
 * Start over clears YOUR loom and nobody else's — asserted, not claimed.
 *
 * `capabilities.ts` tells a reader that `loom-reset-other` is no for every
 * role INCLUDING admin, and gives the reason as construction rather than
 * checking: `resetLoom` takes no `userId`, so a reset of another person is a
 * sentence the function cannot say. That is a good argument exactly as long as
 * it stays true, and nothing in the build was watching it.
 *
 * The failure this exists to catch is ordinary and quiet. Someone builds an
 * admin surface — "clear a student's loom" is a reasonable-sounding support
 * request — adds a parameter here, and every check still passes while the
 * access matrix on /workflows carries on stating a fact that stopped being
 * true. `check-workflows.ts` asserts the gate SYMBOL still exists; it cannot
 * see that the gate now admits somebody new. A wrong row about who can delete
 * whose work is worse than no row at all.
 *
 * Two more negatives are checked here, for the same reason: the event must be
 * written before the delete (it is the only copy of the cloth), and My Loom
 * must not grow a download (that is Keep coming back through the window).
 *
 * Run: npx tsx scripts/check-reset.ts   (part of `npm run check`)
 */
import { readFileSync } from "node:fs"

import { CAPABILITIES } from "../src/lib/capabilities"

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

console.log("\nreset — start over reaches your own loom and no further")

/**
 * Read with line endings normalised.
 *
 * Not a nicety. `core.autocrlf` hands a Windows checkout CRLF, so any pattern
 * here written with `\n` — the function-body boundary below especially —
 * silently stops matching and this file reports breakages that are not there.
 * Found the honest way: by breaking `resetLoom` on purpose to confirm the
 * check caught it, and watching every assertion fail for the wrong reason
 * after a `git checkout` restored the file.
 */
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n")

const ACTIONS = "src/actions/loom.ts"
const actions = read(ACTIONS)

// 1. THE ONE THAT MATTERS. An empty parameter list is the whole guarantee:
//    with nothing to pass, no caller can name a victim. Written as a regex on
//    the signature rather than a type-level test because the point is that
//    adding a parameter must FAIL, and a parameter is a syntactic act.
const signature = /export async function resetLoom\(\s*\)/.test(actions)
assert(
  signature,
  "resetLoom takes no parameters",
  "resetLoom's signature gained an argument — if it is a userId, `loom-reset-other` in capabilities.ts is now a false row and an admin can delete a student's work; if it is something else, widen this check deliberately"
)

// 2. And it must still derive the person from the session, not from a caller.
// Bounded by the next top-level `export` rather than by a closing brace at
// column 0 — same result today, but it does not depend on how the function
// happens to be formatted.
const start = actions.indexOf("export async function resetLoom")
const rest = actions.slice(start + 1)
const nextExport = rest.indexOf("\nexport ")
const fn = nextExport === -1 ? actions.slice(start) : actions.slice(start, start + 1 + nextExport)
assert(
  /const userId = await getUserId\(\)/.test(fn),
  "resetLoom takes its identity from the session",
  "resetLoom no longer calls getUserId() — the scope of the delete is now coming from somewhere else"
)

// 3. Event before delete. neon-http gives no cross-call transaction, so the
//    order IS the safety: the snapshot is the only copy of what is about to
//    go, and a delete that ran first would destroy a loom with no record of
//    what it held.
const insertAt = fn.indexOf("db.insert(graphEvents)")
const deleteAt = fn.indexOf("db.batch")
assert(
  insertAt !== -1 && deleteAt !== -1 && insertAt < deleteAt,
  "the graph.reset event is written before anything is deleted",
  "the snapshot insert no longer precedes the batch delete — a failed write would now lose the cloth silently"
)

// 4. The event insert must stay OUT of recordEvent, which swallows its own
//    failures by design. That is right everywhere else and backwards here.
assert(
  !/recordEvent\([^)]*graph\.reset/.test(fn),
  "the reset event is not routed through recordEvent",
  "graph.reset now goes through recordEvent, which catches and logs — a failed snapshot would no longer stop the delete"
)

// 5. Links are the student's own vocabulary and did not exist when the first
//    reset was written. Leaving them behind would make "start over" a lie on
//    the object a student is most likely to notice surviving.
assert(
  /db\.delete\(links\)/.test(fn),
  "the reset clears Links too",
  "links are no longer deleted — a student who started over would find their vocabulary intact"
)

// 6. History survives, always (red line 5).
assert(
  !/db\.delete\(graphEvents\)/.test(fn),
  "the Capture Log is never deleted",
  "resetLoom deletes graph_event rows — reset clears the cloth, not the loom's memory of weaving"
)

console.log("\nreset — one reading start over clears the reading and not the vocabulary")

const rStart = actions.indexOf("export async function resetReading")
const rRest = actions.slice(rStart + 1)
const rNext = rRest.indexOf("\nexport ")
const rfn = rNext === -1 ? actions.slice(rStart) : actions.slice(rStart, rStart + 1 + rNext)

// WHICH reading, never WHOSE loom. A second parameter here is the same
// failure `loom-reset-other` describes, wearing a narrower hat.
assert(
  /export async function resetReading\(sourceId: string\)\s*\{/.test(actions),
  "resetReading takes a sourceId and nothing else",
  "resetReading's signature changed — a userId here would let one person clear another's reading, and `reading-reset` in capabilities.ts says that is impossible"
)
assert(
  /await authorizeSourceAccess\(sourceId\)/.test(rfn),
  "resetReading checks the student may open the reading first",
  "the authorizeSourceAccess call is gone — a forged sourceId would clear work in a reading the student cannot see"
)

// THE RULING (TJ, 2026-08-13). Concepts, Links and Threads are user-level and
// survive a reading-scoped reset: "a concept does not belong to a text; a
// passage does". Deleting them here would reach into every other reading.
for (const [table, why] of [
  ["concepts", "a concept named ahead of its evidence would vanish, and one evidenced in another reading would go with it"],
  ["links", "the student's vocabulary is not this reading's to delete"],
  ["edges", "a thread joins two concepts and belongs to neither reading"],
] as const) {
  assert(
    !new RegExp(`db\\.delete\\(${table}\\)`).test(rfn),
    `resetReading leaves ${table} alone`,
    `resetReading deletes ${table} — ${why}`
  )
}

assert(
  /db\.delete\(views\)/.test(rfn),
  "resetReading clears the cleared projections' boards",
  "the `map:<id>` view rows are no longer deleted — nothing cascades them, so board geometry would outlive the projection it arranged"
)
assert(
  rfn.indexOf("db.insert(graphEvents)") !== -1 &&
    rfn.indexOf("db.insert(graphEvents)") < rfn.indexOf("db.batch"),
  "resetReading writes its event before deleting",
  "the snapshot insert no longer precedes the batch delete"
)
// Stamped, not inferred: every passage this act names is about to stop
// existing, so eventBelongsToReading's evidence fallback would have nothing
// left to place the event by and it would fall out of the reading's log.
// BOTH branches, checked separately. A first pass asserted `{ sourceId, counts`
// once, which the over-cap fallback satisfied on its own — so dropping the
// stamp from the ordinary path would have gone through unnoticed.
assert(
  /\?\s*\{ sourceId, counts, snapshot \}/.test(rfn),
  "the reading.reset event carries its sourceId (with a snapshot)",
  "the payload no longer stamps sourceId — the act would vanish from the Capture Log of the reading it happened in"
)
assert(
  /:\s*\{ sourceId, counts, snapshotOmitted/.test(rfn),
  "and carries it when the snapshot was too big to keep",
  "the over-cap payload no longer stamps sourceId — a big reading's reset would fall out of its own log"
)

console.log("\nmy loom — a mirror and an exit, never a workshop")

const MODAL = "src/components/ui/MyLoomModal.tsx"
const modal = read(MODAL)

// 7. No download, by any route. Downloads happen AT THE OBJECT
//    (docs/keep-at-the-object.md); a dialog that collects them has rebuilt the
//    tab that ruling deleted.
assert(
  !/graphExport|buildMapExport|createObjectURL|download=/.test(modal),
  "My Loom offers no download",
  `${MODAL} builds or offers a file — downloads belong at the object, and collecting them here is Keep returning`
)

// 8. A destructive dialog owes the keyboard the same manners the app's own
//    confirm already has (DialogProvider: focus, Escape, trap).
assert(
  /key === "Escape"/.test(modal),
  "Escape closes it",
  `${MODAL} has no Escape handler while claiming aria-modal`
)
assert(
  /key === "Tab"/.test(modal),
  "Tab is trapped inside it",
  `${MODAL} lets focus walk out into the page behind an aria-modal dialog`
)

console.log("\ncapabilities — the two rows this file defends")

const own = CAPABILITIES.find((c) => c.id === "loom-reset")
const other = CAPABILITIES.find((c) => c.id === "loom-reset-other")

assert(!!own, "loom-reset is in the matrix", "the row is gone; /workflows no longer says who can start over")
assert(
  !!own && [own.student, own.faculty, own.admin].every((a) => a.verdict === "yes"),
  "everyone may start over in their own work",
  "loom-reset is no longer yes for all three — faculty and admins weave here too"
)
assert(
  !!other && [other.student, other.faculty, other.admin].every((a) => a.verdict === "no"),
  "nobody may clear somebody else's loom, admin included",
  "loom-reset-other stopped being no across the board — if that is deliberate, resetLoom's signature and check 1 above have to change with it"
)

console.log(
  failures === 0
    ? `\n[check-reset] all ${checks} assertions passed`
    : `\n[check-reset] ${failures} of ${checks} FAILED`
)
process.exit(failures === 0 ? 0 : 1)
