import * as dotenv from "dotenv"
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// quiet: dotenv v17 logs a line (with a rotating promo "tip") to STDOUT on
// every config() call, which corrupts the output of any script that pipes it.
//
// The path was hardcoded to .env.local, which made `vercel env pull` a trap: it
// writes .env.production.local, nothing reads it, and a script run to inspect
// production silently reports on development instead — with output identical
// enough to be believed. Hence LOOM_ENV_FILE, and databaseLabel() below so a
// script can say out loud which database it actually reached.
const ENV_FILE = process.env.LOOM_ENV_FILE || ".env.local"
dotenv.config({ path: ENV_FILE, quiet: true })

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

const DATABASE_URL = normalizeEnvValue(process.env.DATABASE_URL)!

// `vercel env pull` writes the literal string "[SENSITIVE]" for any variable
// marked sensitive in the dashboard — it will not export the value, by design.
// The resulting file looks complete and is not, so say so here rather than let
// it surface as an opaque "not a valid URL" from deep inside the driver.
if (DATABASE_URL === "[SENSITIVE]") {
	throw new Error(
		`DATABASE_URL in ${ENV_FILE} is the placeholder "[SENSITIVE]", not a connection string. ` +
			`Vercel does not export values for variables marked sensitive. Copy the connection ` +
			`string from the Neon console into ${ENV_FILE} to run against that environment.`
	)
}

/**
 * Which database this process is actually talking to — host and database name,
 * never the credentials. Scripts that read or write library data should print
 * this before they do anything, so "I ran it against production" is something
 * you can see rather than something you assume.
 */
export function databaseLabel() {
	try {
		const url = new URL(DATABASE_URL)
		const database = url.pathname.replace(/^\//, "").split("?")[0]
		return `${database} @ ${url.hostname} (env: ${ENV_FILE})`
	} catch {
		return `unparseable DATABASE_URL (env: ${ENV_FILE})`
	}
}

const sql = neon(DATABASE_URL);
export const db = drizzle(sql, { schema });
