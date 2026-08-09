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
  "src/lib/reingest.ts",
  "src/lib/readingScore.ts",
  "src/lib/readingUpload.ts",
  "src/lib/readingUploadClient.ts",
  "src/actions/repairs.ts",
  "src/actions/sources.ts",
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

const loom = readFileSync(join(root, "src/actions/loom.ts"), "utf8")
const history = readFileSync(join(root, "src/components/ui/HistoryPanel.tsx"), "utf8")

// recordEvent(userId, courseId, "<kind>", …) — the third argument.
const emitted = [...loom.matchAll(/recordEvent\(\s*[^,]+,\s*[^,]+,\s*"([a-z.]+)"/g)].map((m) => m[1])
const replayed = new Set([...history.matchAll(/case\s+"([a-z.]+)"/g)].map((m) => m[1]))

assert(emitted.length > 0, "found the emitted kinds to check", "the recordEvent call shape changed; this guard is now blind")

const unreplayed = [...new Set(emitted)].filter((k) => !replayed.has(k))
assert(
  unreplayed.length === 0,
  "every emitted kind has a case in HistoryPanel",
  `${unreplayed.join(", ")} would be written to graph_event and never shown — a shorter history than the truth, with no error`
)

const oldSpelling = [...new Set([...emitted, ...replayed])].filter((k) => k.startsWith("byte."))
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
