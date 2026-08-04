import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Same override the runtime honours (src/db/index.ts). Without it, migrations
// could only ever be applied to whatever .env.local points at — so pointing a
// script at production and then migrating would quietly migrate development,
// which is the worse half of that mistake.
const ENV_FILE = process.env.LOOM_ENV_FILE || ".env.local";
dotenv.config({ path: ENV_FILE, quiet: true });

function normalizeEnvValue(value?: string) {
  if (!value) return value
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

// Migrations are irreversible in a way scripts are not, so say the target out
// loud the way every other database-touching entry point in this repo does.
try {
  const { hostname, pathname } = new URL(normalizeEnvValue(process.env.DATABASE_URL)!);
  console.log(`[drizzle] target: ${pathname.replace(/^\//, "")} @ ${hostname} (env: ${ENV_FILE})`);
} catch {
  console.log(`[drizzle] target: unparseable DATABASE_URL (env: ${ENV_FILE})`);
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeEnvValue(process.env.DATABASE_URL)!,
  },
});
