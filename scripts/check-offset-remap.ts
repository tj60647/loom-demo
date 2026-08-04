/**
 * Assertions for src/lib/offsetRemap.ts — the precondition that decides whether
 * a repaired PDF can keep students' existing highlights.
 *
 * This is a plain script rather than a suite because the repo has no test
 * runner, and adding one is a bigger decision than this file should make. It
 * follows the `scripts/check-*` idiom already here: run it, read the output,
 * non-zero exit on failure.
 *
 *   npx tsx scripts/check-offset-remap.ts
 *
 * Every case below is a fact measured against pdf.js's own layout code
 * (pdf.worker.mjs getCharUnicodeCategory) rather than a guess about it. The
 * category rule in particular is easy to "tidy" into something that looks
 * equivalent and is not — whitespace counts only at the start of an expansion,
 * a format character only at the end, a combining mark anywhere — so these
 * exist mainly to catch that.
 */
import {
  expandCharCode,
  isCategorySpecial,
  planOffsetRemap,
  remapOffset,
} from "../src/lib/offsetRemap"

let failures = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${name}` +
      (ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`)
  )
}

console.log("\ncategory predicate — which expansions pdf.js lays out specially")
check("a plain letter is ordinary", isCategorySpecial("a"), false)
check("a ligature expansion is ordinary", isCategorySpecial("fi"), false)
check("an empty string is ordinary", isCategorySpecial(""), false)
check("a space is special", isCategorySpecial(" "), true)
check("a tab is special", isCategorySpecial("\t"), true)
check("a no-break space is special", isCategorySpecial(" "), true)
check("a soft hyphen (Cf) is special", isCategorySpecial("­"), true)
check("a zero-width space (Cf) is special", isCategorySpecial("​"), true)
check("a combining acute (Mn) is special", isCategorySpecial("́"), true)
check("a combining mark anywhere in the string is special", isCategorySpecial("á"), true)
check("a LEADING space is special", isCategorySpecial(" hi"), true)
check("a TRAILING space is not — only leading counts", isCategorySpecial("hi "), false)

console.log("\ncharacter-code expansion — the falsy-fallback that broke the first model")
check("a blank map entry falls back to the code point", expandCharCode(new Map([[80, ""]]), 80), "P")
check("an absent map entry falls back too", expandCharCode(new Map(), 80), "P")
check("a real entry is used", expandCharCode(new Map([[80, "fi"]]), 80), "fi")

console.log("\nremap plans — is an exact carry-over of existing highlights available?")
const ordinary = planOffsetRemap(new Map([[33, "!"]]), new Map([[33, "fi"]]))
check("a length-changing but category-preserving repair is exact", ordinary.exact, true)
check("  and reports which code changed", ordinary.changedCodes, [33])

const fromWhitespace = planOffsetRemap(new Map([[98, " "]]), new Map([[98, "S"]]))
check("a code that WAS whitespace is not exact", fromWhitespace.exact, false)
check("  and the obstacle is named", fromWhitespace.obstacles.length, 1)

const toCombining = planOffsetRemap(new Map([[65, "a"]]), new Map([[65, "́"]]))
check("a code that BECOMES a combining mark is not exact", toCombining.exact, false)

const untouched = planOffsetRemap(new Map([[98, " "]]), new Map([[98, " "]]))
check("an unchanged special code is not an obstacle", untouched.exact, true)
check("  and is not counted as changed", untouched.changedCodes, [])

console.log("\noffset arithmetic — 'a!b' repaired to 'afib'")
const run = [
  { from: "a", to: "a" },
  { from: "!", to: "fi" },
  { from: "b", to: "b" },
]
check("an offset before the change does not move", remapOffset(run, 0), { offset: 0, snapped: false })
check("an offset at the changed glyph", remapOffset(run, 1), { offset: 1, snapped: false })
check("an offset after the change shifts by the delta", remapOffset(run, 2), { offset: 3, snapped: false })
check("an offset at the end of the text", remapOffset(run, 3), { offset: 4, snapped: false })

console.log(
  failures === 0
    ? "\n[check-offset-remap] all assertions passed\n"
    : `\n[check-offset-remap] ${failures} FAILED\n`
)
process.exit(failures === 0 ? 0 : 1)
