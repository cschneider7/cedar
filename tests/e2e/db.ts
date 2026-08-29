import pg from "pg"

/**
 * Shared connection pool to the local Supabase Postgres. Used by the e2e
 * fixtures, helpers, and prepare-stack script — never by the app under test.
 */
export const pool = new pg.Pool({
  host: process.env.E2E_PGHOST ?? "127.0.0.1",
  port: Number(process.env.E2E_PGPORT ?? 54322),
  user: process.env.E2E_PGUSER ?? "postgres",
  password: process.env.E2E_PGPASSWORD ?? "postgres",
  database: process.env.E2E_PGDATABASE ?? "postgres",
  max: 4,
})

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[])
  return result.rows
}

export async function closePool(): Promise<void> {
  await pool.end()
}
