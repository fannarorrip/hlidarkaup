// Shared PostgreSQL connection pool (the self-hosted accounting/catalog DB).
// Reads DATABASE_URL (local dev: postgres://postgres@127.0.0.1:5455/hlidarkaup).
import { Pool, QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as { _pgPool?: Pool };

// Cloud Postgres (Neon, Supabase, etc.) requires TLS; local dev (localhost) does not.
const cs = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(cs) || cs === "";
const needsSsl = !isLocal && !/sslmode=disable/.test(cs);

export const db =
  globalForDb._pgPool ?? new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForDb._pgPool = db;

/** Run a query and return the rows (typed). */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await db.query<T>(text, params as never);
  return res.rows;
}
