import { db } from "../src/db"
import { sql } from "drizzle-orm"

async function run() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "source" (
      "id" text PRIMARY KEY NOT NULL,
      "title" text NOT NULL,
      "author" text DEFAULT '',
      "description" text DEFAULT '',
      "storageKey" text NOT NULL,
      "createdByUserId" text,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "source_page" (
      "id" text PRIMARY KEY NOT NULL,
      "sourceId" text NOT NULL,
      "pageNumber" integer NOT NULL,
      "textContent" text NOT NULL,
      "contentHash" text NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )`,
    `ALTER TABLE "byte" ADD COLUMN IF NOT EXISTS "sourceId" text`,
    `ALTER TABLE "byte" ADD COLUMN IF NOT EXISTS "pageContentHash" text`,
  ]

  for (const statement of statements) {
    await db.execute(sql.raw(statement))
    console.log(`[apply-db-compat] applied: ${statement.split("\n")[0]}`)
  }
}

run().catch((err) => {
  console.error("[apply-db-compat] failed:", err)
  process.exit(1)
})