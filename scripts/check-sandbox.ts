/**
 * The practice loom keeps nothing — asserted, not promised.
 *
 * `/sandbox` renders the REAL workbench over `SandboxLoomProvider`, whose one
 * job is that no student gesture reaches the database. The whole guarantee
 * rests on a negative: that provider must never gain a server call. A single
 * `import { createConcept } from "@/actions/loom"` added there in six months —
 * by someone fixing a bug, reasonably, in a file that looks like the real
 * provider — turns a practice space into one that silently writes to a real
 * student's loom. Nothing else in the build would notice: it type-checks, it
 * renders, and the write succeeds.
 *
 * So this checks the negative directly. Cheap, and it fails at the commit
 * rather than never.
 *
 * Run: npx tsx scripts/check-sandbox.ts   (part of `npm run check`)
 */
import { readFileSync } from "node:fs"

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

console.log("\nsandbox — the practice loom cannot write")

const PROVIDER = "src/components/providers/SandboxLoomProvider.tsx"
const src = readFileSync(PROVIDER, "utf8")

// 1. No server actions, by any route in. `@/actions/*` is where every write
//    lives; `"use server"` would make this file one itself.
const actionImport = /from\s+["']@\/actions\//.test(src)
assert(!actionImport, "imports no server action", `${PROVIDER} imports from @/actions — a gesture there would write to a real loom`)
assert(!src.includes('"use server"'), "is not itself a server module", `${PROVIDER} declares "use server"`)

// 2. No client read surface either. src/lib/reads.ts GETs the student's real
//    rows; showing those inside the practice loom would be the same leak
//    wearing a different hat.
assert(
  !/from\s+["']@\/lib\/reads["']/.test(src),
  "reads none of the student's real rows",
  `${PROVIDER} imports @/lib/reads — the practice loom would show real work`
)

// 3. No raw transport. An action is the ordinary way to write, not the only
//    conceivable one.
assert(!/\bfetch\s*\(/.test(src), "makes no fetch call", `${PROVIDER} calls fetch directly`)
assert(!/navigator\.sendBeacon/.test(src), "sends no beacon", `${PROVIDER} calls sendBeacon`)

// 4. The seam it depends on must stay exported, or the sandbox silently falls
//    back to the REAL provider's context — every write suddenly real, with no
//    error anywhere.
const real = readFileSync("src/components/providers/LoomProvider.tsx", "utf8")
assert(
  /export const LoomContext\b/.test(real),
  "LoomContext is exported for the sandbox to supply",
  "LoomProvider no longer exports LoomContext — SandboxLoomProvider cannot override it"
)
assert(
  /export interface LoomContextType\b/.test(real),
  "LoomContextType is exported, so drift breaks the build",
  "LoomProvider no longer exports LoomContextType — the sandbox would drift silently"
)

// 5. The band is the safety argument; it must be standing, not a toast.
const workbench = readFileSync("src/components/Workbench.tsx", "utf8")
assert(
  workbench.includes("practiceband"),
  "the practice band still renders",
  "Workbench no longer renders .practiceband — a student cannot tell practice from data loss"
)
assert(
  /\{!practice && \(/.test(workbench),
  "search is withheld in practice",
  "Workbench renders ShelfSearch in the practice loom — it reads the student's real rows"
)

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
