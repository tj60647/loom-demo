/**
 * WHERE PRODUCTION'S DATABASE URL COMES FROM, in one place.
 *
 * Two scripts need it and neither should guess: `check-prod-migrations.ts`,
 * which reads production's migration table, and `migrate-prod.ts`, which
 * writes to it. Guessing wrong means reading — or worse, migrating — the wrong
 * database, and the dev and production branches differ by one word in a
 * hostname (ep-green-wave… against ep-gentle-feather…).
 *
 * PROD_DATABASE_URL first, because that is what CI can be given. The pulled
 * env file is the local fallback: `.env.production.pulled` is what
 * `vercel env pull` leaves behind, it is gitignored, and it is the file a
 * developer already has if they have ever pulled production's environment.
 */
import fs from "node:fs"

export type ProdDb = { url: string; host: string; from: string }

/** Null rather than a throw: a caller with no production URL must be able to
 *  say so and skip, which is what lets the CI check land before the secret. */
export function resolveProdDatabase(): ProdDb | null {
  const fromEnv = process.env.PROD_DATABASE_URL?.trim()
  if (fromEnv) return { url: fromEnv, host: hostOf(fromEnv), from: "PROD_DATABASE_URL" }

  const file = ".env.production.pulled"
  if (!fs.existsSync(file)) return null
  const match = /^DATABASE_URL="?([^"\n]+)"?/m.exec(fs.readFileSync(file, "utf8"))
  if (!match) return null
  return { url: match[1], host: hostOf(match[1]), from: file }
}

/** The host alone — safe to print. A whole connection string carries the
 *  password, and these scripts print what they are about to touch. */
export function hostOf(url: string): string {
  const match = /@([^/]+)\//.exec(url)
  return match ? match[1] : "unknown-host"
}

/** The migrations this repo carries, oldest first, by folder tag. */
export function journalTags(): string[] {
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { tag: string }[]
  }
  return journal.entries.map((entry) => entry.tag)
}
