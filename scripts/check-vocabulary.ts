/**
 * The code says what the model says.
 *
 * Two guards, both for failures that are silent by nature.
 *
 * 1 · **No Passage is called a byte.** The rename of 2026-08-09 moved ~310
 *     identifiers plus the database (migration 0023). It took THREE passes to
 *     finish, because a word-boundary regex cannot see camelCase and a
 *     case-insensitive grep matches `getByText`. Nothing about that is
 *     memorable, so this asserts it instead: the word may appear only where it
 *     means FILE DATA, and the allowlist below is the whole of that.
 *
 *     This is not pedantry about a word. AGENTS.md previously declared "code
 *     speaks the July names", so a reader handed this repo would have concluded
 *     Passages were called bytes deliberately — which is the confusion the
 *     rename existed to end, reintroduced by a stale sentence.
 *
 * 2 · **Every event the code emits is one the Capture Log replays.** Emit a
 *     kind `HistoryPanel` has no `case` for and the entry vanishes from the
 *     student's history — no error, no warning, just a shorter log than the
 *     truth. Migration 0023 rewrote the stored `byte.*` kinds to `passage.*`,
 *     so this also asserts nothing emits the old spelling.
 *
 * Run: npx tsx scripts/check-vocabulary.ts   (part of `npm run check`)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

let failures = 0
let checks = 0

function assert(condition: boolean, label: string, detail: string) {
  checks++
  if (condition) console.log(`  ok    ${label}`)
  else {
    failures++
    console.log(`  FAIL  ${label}\n        ${detail}`)
  }
}

const root = join(__dirname, "..")

/**
 * Where "byte" legitimately means an octet. Every entry is FILE DATA: a PDF
 * buffer, an upload size, a blob. None of them is a Passage.
 *
 * Adding a file here is a claim that the word means octets in it. If you are
 * adding one because a Passage crept back in, that is the bug.
 */
const FILE_DATA = new Set([
  "src/lib/storage.ts",
  "src/lib/textLayerRepair.ts",
  "src/lib/repairPipeline.ts",
  // `repaired.bytes` — textLayerRepair's rewritten PDF buffer, applied here.
  "src/lib/repairApply.ts",
  "src/lib/reingest.ts",
  "src/lib/readingScore.ts",
  "src/lib/readingUpload.ts",
  "src/lib/readingUploadClient.ts",
  "src/actions/repairs.ts",
  "src/actions/sources.ts",
  // The same buffer, round-tripped through a generated fixture.
  "scripts/check-block-repair.ts",
  // The reading route's Content-Length/ETag prose and the page-image
  // pipeline: "bytes" is always the PDF's octets or an encoded WebP —
  // source.byteLength, buffer.byteLength, "10MB of bytes re-downloaded".
  "src/app/api/readings/[sourceId]/route.ts",
  "src/app/api/readings/[sourceId]/pages/sheet/route.ts",
  "src/lib/pdfPages.ts",
  "src/components/pdf/PageSlot.tsx",
  "scripts/backfill-page-assets.ts",
])

/**
 * The two places the word survives ON PURPOSE, because a student's already
 * downloaded files say it.
 */
const DELIBERATE = new Set([
  // The importer reads the pre-rename export key. Red line 5.
  "src/lib/graphExport.ts",
  // Its guard, which has to write a pre-rename file to test one.
  "scripts/check-import-compat.ts",
  // The note explaining that the table WAS `byte` until 0023.
  "src/db/schema.ts",
  // This file, which cannot describe the rule without naming the word.
  "scripts/check-vocabulary.ts",
])

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "drizzle", "playwright-report", "test-results"])
const EXT = [".ts", ".tsx", ".css"]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

console.log("\nvocabulary — no Passage is called a byte")

// Word boundaries, or this matches `getByText` and reports the whole suite.
const WORD = /\bbytes?\b/i
const offenders: string[] = []
for (const base of ["src", "scripts", "tests", "playwright"]) {
  const dir = join(root, base)
  if (!existsSync(dir)) continue
  for (const file of walk(dir)) {
    const rel = relative(root, file).replace(/\\/g, "/")
    if (FILE_DATA.has(rel) || DELIBERATE.has(rel)) continue
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (WORD.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 96)}`)
    })
  }
}
assert(
  offenders.length === 0,
  "the word appears only where it means file data",
  `${offenders.length} site(s):\n        ${offenders.join("\n        ")}`
)

console.log("\ndocs — the live ones do not call a Passage a byte either")

/**
 * History, and prose about octets. These may say the word freely.
 *
 *   archive/, v14-*, audit-2026-*  records of a past state, by definition.
 *   loom-refactor-spec.md          a work order whose P0–P3 are all executed;
 *                                  it quotes superseded rulings verbatim.
 *   course-deployment-notes.md     the ETYMOLOGY: CAVEAT called a captured
 *                                  datum a "byte", which is where Loom got the
 *                                  word. Rewriting that erases the lineage the
 *                                  document exists to record.
 *   reading-quality.md             "junk bytes", "byte count" — characters.
 *   NEXT_SESSION.md                a running log with an explicit history half.
 */
const DOC_HISTORY =
  /^(docs\/(archive\/|presentations\/|v14-|audit-2026|loom-refactor-spec|course-deployment-notes|reading-quality)|NEXT_SESSION\.md)/

/**
 * Only CODE references are flagged, never the English word. "the PDF bytes" and
 * "a byte-identical label" are correct prose; `byte.sourceId` and `byte_concept`
 * are stale schema. A line explicitly about the rename may say either.
 */
const DOC_CODE_REF =
  /`bytes?`|\bbyte[._][a-zA-Z]|\b(handleAdd|add|create|refile|unfile|delete|remove|attribute)Bytes?\b|\bbyteIds?\b/
const DOC_ABOUT_RENAME =
  /0023|before the rename|old (key|spelling|rule)|renamed|migration log|now `passage`|are gone|reads BOTH|compat/i

/**
 * The exemption reads a WINDOW, not a line. Prose explaining the rename runs to
 * a paragraph — "**`bytes` are gone.** They are `passages` — in the code, in
 * the UI, and since migration 0023 …" puts the code reference and the
 * explanation on different lines, and a line-at-a-time test would flag the
 * explanation for containing the thing it is explaining.
 */
const WINDOW = 3
const docOffenders: string[] = []
function scanDoc(abs: string, rel: string) {
  const lines = readFileSync(abs, "utf8").split("\n")
  lines.forEach((line, i) => {
    if (!DOC_CODE_REF.test(line)) return
    const near = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join(" ")
    if (DOC_ABOUT_RENAME.test(near)) return
    docOffenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 96)}`)
  })
}
function walkDocs(dir: string) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkDocs(p)
    else if (name.endsWith(".md")) {
      const rel = relative(root, p).replace(/\\/g, "/")
      if (!DOC_HISTORY.test(rel)) scanDoc(p, rel)
    }
  }
}
walkDocs(join(root, "docs"))
for (const f of ["AGENTS.md", "README.md"]) {
  const p = join(root, f)
  if (existsSync(p)) scanDoc(p, f)
}
assert(
  docOffenders.length === 0,
  "no live doc names a byte table, column or function",
  `${docOffenders.length} site(s):\n        ${docOffenders.join("\n        ")}`
)

console.log("\ncapture log — every event emitted is an event replayed")

/**
 * EVERY file that emits, not just loom.ts.
 *
 * This read `src/actions/loom.ts` alone until 2026-08-17, which was true for
 * as long as that file was the only one calling `recordEvent`. On the day
 * `recordEvent` moved to `src/lib/graphEvent.ts` so that `actions/sources.ts`
 * could record a reading being taken off a shelf, this guard went green
 * without seeing the new kind at all — the same silent pass its own note
 * above describes, arriving by a different door.
 *
 * So the emitter list is DERIVED: any file importing the recorder is a file
 * that can emit, and gets read. Adding a third emitter needs no edit here.
 */
const emitters = walk(join(root, "src"))
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .map((f) => ({ f, src: readFileSync(f, "utf8") }))
  .filter(({ src }) => /from\s+"@\/lib\/graphEvent"/.test(src))
const loom = emitters.map(({ src }) => src).join("\n")
const history = readFileSync(join(root, "src/components/ui/HistoryPanel.tsx"), "utf8")

assert(
  emitters.length > 0,
  `found the files that emit events (${emitters.length})`,
  "nothing imports @/lib/graphEvent — the recorder moved, and this guard is now reading nothing"
)

/**
 * The FOLD's cases, not every `case` in the file.
 *
 * This read the whole of HistoryPanel.tsx until 2026-08-15, and was green for
 * the six days it existed without ever testing what it claimed: the file also
 * held `describeEvent`, whose switch named every kind, so five kinds the fold
 * had never handled were covered by the phrasing switch next door. Moving
 * `describeEvent` to src/lib/logPhrase.ts (94b815f) took the decoy away and the
 * real gap — there since `map.create` in July — surfaced at once, looking like
 * a regression that commit had not caused.
 *
 * `\r?\n\}`, not `\n\}`: core.autocrlf is on for this checkout.
 */
function foldBody(src: string): string | null {
  const start = src.indexOf("function foldEvents")
  if (start < 0) return null
  const end = src.slice(start).search(/\r?\n\}/)
  return end < 0 ? null : src.slice(start, start + end)
}

// recordEvent(userId, courseId, "<kind>", …) — the third argument.
const emitted = [...loom.matchAll(/recordEvent\(\s*[^,]+,\s*[^,]+,\s*"([a-z.]+)"/g)].map((m) => m[1])
const fold = foldBody(history)
const replayed = new Set([...(fold ?? "").matchAll(/case\s+"([a-z.]+)"/g)].map((m) => m[1]))

assert(emitted.length > 0, "found the emitted kinds to check", "the recordEvent call shape changed; this guard is now blind")
// Without this the guard fails open the day the fold is renamed or moved: no
// body found is an empty case set, which would read as "nothing is replayed"
// only if something is emitted — and would read as green if the emit regex
// broke on the same day. Say it out loud instead.
assert(
  fold !== null,
  "found foldEvents to read the cases from",
  "no `function foldEvents` in HistoryPanel.tsx — the fold moved or was renamed, and this guard is now reading nothing"
)

const unreplayed = [...new Set(emitted)].filter((k) => !replayed.has(k))
assert(
  unreplayed.length === 0,
  "every emitted kind has a case in HistoryPanel",
  `${unreplayed.join(", ")} would be written to graph_event and never shown — a shorter history than the truth, with no error`
)

// The old spelling is hunted WIDER than the fold: scoping the search above to
// `foldEvents` would otherwise stop this looking at the phrasing switch, and a
// `case "byte.capture"` there is just as dead — it would silently phrase
// nothing for every row migration 0023 rewrote.
const allCases = [history, readFileSync(join(root, "src/lib/logPhrase.ts"), "utf8")]
  .flatMap((src) => [...src.matchAll(/case\s+"([a-z.]+)"/g)].map((m) => m[1]))
const oldSpelling = [...new Set([...emitted, ...allCases])].filter((k) => k.startsWith("byte."))
assert(
  oldSpelling.length === 0,
  "no event kind still spells it byte.*",
  `${oldSpelling.join(", ")} — migration 0023 rewrote the stored rows, so emitting or matching the old spelling now silently misses every one of them`
)

console.log(
  failures === 0
    ? `\n[check-vocabulary] all ${checks} assertions passed`
    : `\n[check-vocabulary] ${failures} of ${checks} FAILED`
)
process.exit(failures === 0 ? 0 : 1)
