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
 * EVERY ADMIN PAGE ON DISK, not merely every page that declared itself. The
 * first version of this check walked the declarations, which left the routes
 * living on DEFAULT_SCOPE unexamined — and one of them, /admin/user/[id], was
 * drawing a section picker its page never mentions. Copilot found that on #36,
 * in a check written to prevent exactly it.
 *
 * WHAT THIS CANNOT CATCH, said plainly so nobody trusts it further than it
 * goes. The sibling bug found the same day — /admin/heatmaps resolving the
 * section, handing it to the margin cards, and never passing it to the viewer
 * that draws the heat — would pass every assertion below, because the page
 * does define and use `sectionId`. Read-then-dropped-on-the-way-to-a-child is
 * not visible to a grep, and the specs in tests/heatmap.spec.ts and
 * tests/journey-admin.spec.ts are what hold that one: they compare a count
 * before and after choosing a section, which no static rule can do.
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
const ADMIN = "src/app/admin"
const source = fs.readFileSync(NAV, "utf8")

/** Each `"/admin/…": { section: true|false, reading: …, student: … }` entry. */
const entries = [...source.matchAll(/"(\/admin[^"]*)":\s*\{([^}]*)\}/g)].map((m) => ({
  route: m[1],
  section: /section:\s*true/.test(m[2]),
  reading: /reading:\s*true/.test(m[2]),
  student: /student:\s*true/.test(m[2]),
}))

/** Every `page.tsx` under /admin, as the route it serves. */
function routesOnDisk(dir: string, prefix = "/admin"): { route: string; file: string }[] {
  const out: { route: string; file: string }[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...routesOnDisk(full, `${prefix}/${entry.name}`))
    } else if (entry.name === "page.tsx") {
      out.push({ route: prefix, file: full })
    }
  }
  return out
}

/**
 * The same longest-declared-prefix rule AdminNav resolves a pathname with.
 *
 * A dynamic segment matches by its parent prefix, exactly as a real pathname
 * does: `/admin/user/[id]` on disk is `/admin/user/8f3…` in the browser, and
 * both resolve to the `/admin/user` entry. An exact-key lookup is what let
 * that page fall through to the default in the first place.
 */
const asPathname = (route: string) => route.replace(/\/\[[^\]]+\]/g, "")
function scopeFor(route: string) {
  const pathname = asPathname(route)
  return entries
    .filter((entry) => pathname === entry.route || pathname.startsWith(`${entry.route}/`))
    .sort((a, b) => b.route.length - a.route.length)[0]
}

/** The reader a page uses for each scope, whatever it then does with it. */
const READS: Record<string, RegExp> = {
  section: /resolved\w*\.section|resolvedSearchParams\.section|\bsectionId\b/,
  reading: /resolved\w*\.source|resolvedSearchParams\.source|\bsourceId\b/,
  student: /resolved\w*\.student|resolvedSearchParams\.student|\bstudentId\b/,
}

let failures = 0
const fail = (line: string) => {
  console.log(`  FAIL  ${line}`)
  failures += 1
}

console.log("\nscope — every picker the strip draws is read by the page under it")

if (entries.length === 0) {
  console.log(`  FAIL  no SCOPES entries found in ${NAV} — has its shape changed?`)
  process.exit(1)
}
const pages = routesOnDisk(ADMIN)
if (pages.length === 0) {
  console.log(`  FAIL  no admin pages found under ${ADMIN} — has the app moved?`)
  process.exit(1)
}

for (const { route, file } of pages) {
  /**
   * A route group `(name)` adds a folder and no URL segment, so a route built
   * by joining folder names would be wrong for one. None exist under /admin
   * today; this fails rather than quietly comparing the wrong file if one
   * appears.
   */
  if (route.includes("(")) {
    fail(`${route} is inside a route group — teach this check to strip it before trusting it`)
    continue
  }

  const declared = scopeFor(route)
  if (!declared) {
    fail(`${route} has no SCOPES entry — declare it in ${NAV}, even as all false`)
    continue
  }

  const drawn = (["section", "reading", "student"] as const).filter((scope) => declared[scope])
  if (drawn.length === 0) {
    console.log(`  ok    ${route} draws no scope picker (declared at "${declared.route}")`)
    continue
  }

  const page = fs.readFileSync(file, "utf8")
  for (const scope of drawn) {
    if (READS[scope].test(page)) {
      console.log(`  ok    ${route} draws ${scope} and reads it`)
    } else {
      fail(`${route} draws a ${scope} picker its page never reads`)
    }
  }
}

/**
 * AND EVERY DECLARATION POINTS AT A PAGE. A stale entry is harmless until
 * somebody reads the list as an inventory of what exists.
 */
for (const entry of entries) {
  const served = pages.some(({ route }) => {
    const pathname = asPathname(route)
    return pathname === entry.route || pathname.startsWith(`${entry.route}/`)
  })
  if (!served) fail(`"${entry.route}" is declared in ${NAV} but no admin page lives there`)
}

console.log(
  failures === 0
    ? `\n[check-scope] all assertions passed — ${pages.length} admin pages, ${entries.length} declarations\n`
    : `\n[check-scope] ${failures} FAILED — either read the scope, or declare it false in ${NAV}\n`
)
process.exit(failures === 0 ? 0 : 1)
