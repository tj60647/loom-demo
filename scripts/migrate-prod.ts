/**
 * APPLY PENDING MIGRATIONS TO PRODUCTION, deliberately.
 *
 * Nothing else does. CI migrates the CI database (`.github/workflows/ci.yml`,
 * "Migrate CI database") and preview-db.yml migrates preview branches; Vercel
 * runs no migration on deploy. Until this script existed, production was
 * migrated by someone remembering to, which on 2026-08-23 turned out to mean
 * "two days after the code that needed it" — see check-prod-migrations.ts for
 * what that cost.
 *
 *   npm run db:migrate:prod             # says what WOULD run, touches nothing
 *   npm run db:migrate:prod -- --apply  # runs it
 *
 * DRY BY DEFAULT, and it prints the host first. The dev and production
 * branches differ by one word in a hostname — ep-green-wave against
 * ep-gentle-feather — and a migration is the one operation where reading the
 * wrong one by mistake is not recoverable by re-running it.
 *
 * IT DOES NOT VET THE MIGRATIONS. Expand-only is a rule this repository keeps
 * by review (AGENTS.md), not one this script can enforce: a DROP COLUMN and an
 * ADD COLUMN are the same shape to it. What it can do is show you exactly
 * which files are about to run, so the review has something to be about.
 */
import fs from "node:fs"
import { neon } from "@neondatabase/serverless"
import { journalTags, resolveProdDatabase } from "./prod-db"

async function main() {
  const apply = process.argv.includes("--apply")
  const db = resolveProdDatabase()

  if (!db) {
    console.log(
      "\n[migrate-prod] no production database configured.\n" +
        "               Set PROD_DATABASE_URL, or run `vercel env pull .env.production.pulled`.\n"
    )
    return 1
  }

  const tags = journalTags()
  const sql = neon(db.url)
  const rows = (await sql`
    select count(*)::int as n from drizzle.__drizzle_migrations
  `) as { n: number }[]
  const applied = rows[0].n
  const pending = tags.slice(applied)

  console.log(`\n[migrate-prod] target:  ${db.host}  (from ${db.from})`)
  console.log(`[migrate-prod] applied: ${applied} of ${tags.length}`)

  if (pending.length === 0) {
    console.log("[migrate-prod] nothing to do — production is up to date\n")
    return 0
  }

  console.log(`\n[migrate-prod] ${pending.length} pending:\n`)
  for (const tag of pending) {
    const file = `drizzle/${tag}.sql`
    console.log(`  ${tag}`)
    if (fs.existsSync(file)) {
      // The SQL itself, because a reviewer approving a production migration
      // should see the statements rather than a filename.
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const trimmed = line.replace("--> statement-breakpoint", "").trim()
        if (trimmed) console.log(`      ${trimmed}`)
      }
    }
    console.log("")
  }

  if (!apply) {
    console.log("[migrate-prod] DRY RUN — nothing was applied.")
    console.log("[migrate-prod] Re-run with --apply to run the statements above.\n")
    return 0
  }

  console.log("[migrate-prod] APPLYING…\n")
  const { execSync } = await import("node:child_process")
  execSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: db.url },
  })

  const after = (await sql`
    select count(*)::int as n from drizzle.__drizzle_migrations
  `) as { n: number }[]
  console.log(`\n[migrate-prod] applied: ${after[0].n} of ${tags.length}\n`)
  return after[0].n === tags.length ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("[migrate-prod] failed", error)
    process.exit(1)
  })
