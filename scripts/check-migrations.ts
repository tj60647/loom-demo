import * as dotenv from "dotenv"
import { neon } from "@neondatabase/serverless"

dotenv.config({ path: ".env.local" })

function normalize(value?: string) {
  if (!value) return value
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function getDatabaseUrl(): string {
  const url = normalize(process.env.DATABASE_URL)
  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }
  return url
}

const url = getDatabaseUrl()

async function main() {
  const sql = neon(url)
  const rows = await sql`select id, hash, created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 20`
  console.log(rows)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
