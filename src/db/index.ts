import * as dotenv from "dotenv"
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

dotenv.config({ path: ".env.local" })

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
