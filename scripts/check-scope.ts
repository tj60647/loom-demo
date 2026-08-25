/**
 * A PAGE THAT DRAWS A SCOPE PICKER MUST READ THE SCOPE.
 *
 * AdminNav's own header states the rule — "a picker that scopes nothing on the
 * page under it is exactly the incongruity this strip was fixed for" — and
 * /admin/library broke it anyway: it declared section:true through
 * DEFAULT_SCOPE and read the value nowhere at all. A control that silently
 * does nothing is worse than one that is absent, because the reader believes
 * the answer on screen is the answer to the question they asked.
 *
 * WHAT THIS CANNOT CATCH, said plainly so nobody trusts it further than it
 * goes. The sibling bug found the same day — /admin/heatmaps resolving the
 * section, handing it to the margin cards, and never passing it to the viewer
 * that draws the heat — would pass every assertion below, because the page
 * does define and use `sectionId`. Read-then-dropped-on-the-way-to-a-child is
 * not visible to a grep, and the spec in tests/heatmap.spec.ts is what holds
 * that one: it compares the peer denominator before and after choosing a
 * section, which no static rule can do.
 *
 * So this is the coarse half of the pair, deliberately. An end-to-end test
 * proves one page narrows for one section on one seed; this proves every page
 * that advertises a scope reads it at all, including pages added next year.
 *
 *   npx tsx scripts/check-scope.ts
 */
import fs from "node:fs"
import path from "node:path"

const NAV = "src/components/ui/AdminNav.tsx"
const source = fs.readFileSync(NAV, "utf8")

/** Each `"/admin/…": { section: true|false, reading: …, student: … }` entry. */
const entries = [...source.matchAll(/"(\/admin[^"]*)":\s*\{([^}]*)\}/g)].map((m) => ({
  route: m[1],
  section: /section:\s*true/.test(m[2]),
  reading: /reading:\s*true/.test(m[2]),
  student: /student:\s*true/.test(m[2]),
}))

/** The reader a page uses for each scope, whatever it then does with it. */
const READS: Record<string, RegExp> = {
  section: /resolved\w*\.section|resolvedSearchParams\.section|\bsectionId\b/,
  reading: /resolved\w*\.source|resolvedSearchParams\.source|\bsourceId\b/,
  student: /resolved\w*\.student|resolvedSearchParams\.student|\bstudentId\b/,
}

let failures = 0
console.log("\nscope — every picker the strip draws is read by the page under it")

if (entries.length === 0) {
  console.log("  FAIL  no SCOPES entries found — has AdminNav's shape changed?")
  process.exit(1)
}

for (const entry of entries) {
  const file = path.join("src/app", entry.route.replace(/^\//, ""), "page.tsx")
  if (!fs.existsSync(file)) {
    console.log(`  FAIL  ${entry.route} declares a scope but has no page at ${file}`)
    failures += 1
    continue
  }
  const page = fs.readFileSync(file, "utf8")
  for (const scope of ["section", "reading", "student"] as const) {
    if (!entry[scope]) continue
    if (READS[scope].test(page)) {
      console.log(`  ok    ${entry.route} draws ${scope} and reads it`)
    } else {
      console.log(`  FAIL  ${entry.route} draws a ${scope} picker its page never reads`)
      failures += 1
    }
  }
}

console.log(
  failures === 0
    ? "\n[check-scope] all assertions passed\n"
    : `\n[check-scope] ${failures} FAILED — either read the scope, or declare it false in ${NAV}\n`
)
process.exit(failures === 0 ? 0 : 1)
