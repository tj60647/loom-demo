/**
 * NO RAW `console` ON THE SERVER.
 *
 * The 50 calls this rule replaced were the whole complaint (TJ, 2026-08-24:
 * "overall all the logs seem sparse and difficult to interpret"). They were
 * converted in one pass; without a rule they come back one merge at a time,
 * because `console.warn` is what everybody's fingers type.
 *
 * SERVER ONLY, and the exemption is the point rather than a loophole. A server
 * line is collected by Vercel and read by a query, so it wants fields. A CLIENT
 * line is read by a person with devtools open, where a JSON blob is strictly
 * worse than the sentence it replaced — objects there are inspectable, colours
 * and grouping work, and nobody greps their own browser. So `"use client"`
 * files keep `console`, deliberately.
 *
 *   npx tsx scripts/check-logging.ts
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = "src"
/** The logger itself is where `console` is allowed to be spoken. */
const ALLOWED = new Set([path.join("src", "lib", "log.ts")])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** A client component logs for a human at a devtools console, not for a query. */
function isClient(source: string): boolean {
  return /^\s*["']use client["']/m.test(source.split("\n").slice(0, 5).join("\n"))
}

const offenders: { file: string; line: number; text: string }[] = []
let serverFiles = 0
let clientFiles = 0

for (const file of walk(ROOT)) {
  if (ALLOWED.has(file)) continue
  const source = fs.readFileSync(file, "utf8")
  if (isClient(source)) {
    clientFiles += 1
    continue
  }
  serverFiles += 1
  source.split(/\r?\n/).forEach((line, index) => {
    // The call, not the word: a comment explaining why console is wrong here
    // must not itself trip the rule.
    if (/(^|[^.\w])console\s*\.\s*(log|warn|error|info|debug)\s*\(/.test(line)) {
      offenders.push({ file, line: index + 1, text: line.trim().slice(0, 90) })
    }
  })
}

console.log(`\nlogging — server code speaks through src/lib/log.ts`)
console.log(`  read ${serverFiles} server file(s); ${clientFiles} client file(s) exempt by design`)

if (offenders.length === 0) {
  console.log("  ok    no raw console call on a server path\n")
  console.log("[check-logging] all assertions passed\n")
  process.exit(0)
}

console.log(`  FAIL  ${offenders.length} raw console call(s) on a server path:`)
for (const o of offenders) console.log(`        ${o.file}:${o.line}  ${o.text}`)
console.log(
  "\n  Use logInfo / logWarn / logError from @/lib/log instead. They take an\n" +
    "  event name and fields, which is what makes a line findable later:\n" +
    '      logWarn("ingest.cover-failed", { sourceId, cause: error })\n'
)
process.exit(1)
