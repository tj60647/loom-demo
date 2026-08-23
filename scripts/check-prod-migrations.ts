/**
 * IS PRODUCTION'S DATABASE BEHIND THE CODE ABOUT TO SHIP TO IT?
 *
 * Written because it happened. Migration 0028 added `section.leadUserId`, was
 * applied to the dev branch on 2026-08-21, and sat unapplied on production for
 * two days. Nothing noticed: CI migrates the CI database and preview branches,
 * Vercel migrates nothing, and no script existed to ask. It surfaced only when
 * the code that reads that column reached master — and then every /admin page
 * threw "column section.leadUserId does not exist", because
 * `db.select().from(sections)` emits every column in the model.
 *
 * Students were untouched (their paths select narrow column lists), but the
 * whole staff area was down until the migration was applied by hand.
 *
 * This asks the question before the merge rather than after: run it on a pull
 * request into master and it fails while the fix is still cheap.
 *
 *   npx tsx scripts/check-prod-migrations.ts
 *
 * IT SKIPS, RATHER THAN FAILS, WITH NO PRODUCTION URL. The check is useless
 * without one, but failing every fork and every contributor who has never
 * pulled production's environment would teach people to ignore it. Configure
 * PROD_DATABASE_URL (a read-only role is enough — this only reads) and it
 * starts guarding.
 */
import { neon } from "@neondatabase/serverless"
import { journalTags, resolveProdDatabase } from "./prod-db"

async function main() {
  const tags = journalTags()
  const db = resolveProdDatabase()

  if (!db) {
    console.log(
      "\n[check-prod-migrations] SKIPPED — no PROD_DATABASE_URL and no .env.production.pulled.\n" +
        `                        ${tags.length} migrations in the repo; production not checked.\n`
    )
    return 0
  }

  console.log(`\n[check-prod-migrations] reading ${db.host} (from ${db.from})`)

  const sql = neon(db.url)
  let applied: number
  try {
    const rows = (await sql`
      select count(*)::int as n from drizzle.__drizzle_migrations
    `) as { n: number }[]
    applied = rows[0].n
  } catch (error) {
    // A missing migrations table is a real answer — an unmigrated database —
    // not a reason to pass quietly.
    console.log(`  FAIL  could not read the migration table: ${String(error).slice(0, 160)}`)
    return 1
  }

  const behind = tags.length - applied
  console.log(`  repo journal:        ${tags.length}`)
  console.log(`  applied on ${db.host.split(".")[0]}: ${applied}`)

  if (behind === 0) {
    console.log("\n[check-prod-migrations] production is up to date\n")
    return 0
  }

  if (behind < 0) {
    /**
     * Production ahead of the repo. Not a pass: it means a migration was
     * applied that this branch does not carry, so the code about to ship was
     * never tested against the schema it will meet.
     */
    console.log(
      `\n[check-prod-migrations] FAILED — production is ${-behind} AHEAD of this branch.\n` +
        "                        A migration was applied that this code does not carry.\n"
    )
    return 1
  }

  const pending = tags.slice(applied)
  console.log(
    `\n[check-prod-migrations] FAILED — production is ${behind} migration(s) behind:\n` +
      pending.map((tag) => `                          ${tag}`).join("\n") +
      "\n\n" +
      "  Apply them before this merges, or the code that reads the new columns\n" +
      "  will throw on every page that touches them:\n\n" +
      "      npm run db:migrate:prod            # shows what would run\n" +
      "      npm run db:migrate:prod -- --apply # runs it\n"
  )
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("[check-prod-migrations] unexpected failure", error)
    process.exit(1)
  })
