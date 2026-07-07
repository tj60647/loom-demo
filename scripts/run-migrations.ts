import { migrate } from "drizzle-orm/neon-http/migrator"
import { db } from "../src/db"

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" })
  console.log("[run-migrations] complete")
}

main().catch((error) => {
  console.error("[run-migrations] failed", error)
  process.exit(1)
})
