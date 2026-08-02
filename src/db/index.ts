import * as dotenv from "dotenv"
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// quiet: dotenv v17 logs a line (with a rotating promo "tip") to STDOUT on
// every config() call, which corrupts the output of any script that pipes it.
dotenv.config({ path: ".env.local", quiet: true })

// ponytail: local Docker Postgres proxy (see docker-compose.yml), unused when DATABASE_URL is a real Neon host
if (process.env.NODE_ENV !== "production") {
	neonConfig.fetchEndpoint = (host) => {
		const [protocol, port] = host === "db.localtest.me" ? ["http", 4444] : ["https", 443]
		return `${protocol}://${host}:${port}/sql`
	}
}

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

const sql = neon(normalizeEnvValue(process.env.DATABASE_URL)!);
export const db = drizzle(sql, { schema });
