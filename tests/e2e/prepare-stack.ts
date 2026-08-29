import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { pool } from "./db.ts"
import { provisionAuthPool } from "./fixtures.ts"

/**
 * One-shot local-stack preparation for the Playwright e2e suite
 */

const POOL_SIZE = Number(process.env.E2E_USER_POOL_SIZE ?? 6)
const AUTH_DIR = path.resolve("playwright/.auth")
const PG_READY_TIMEOUT_MS = 60_000
const AUTH_HEALTH_URL = "http://127.0.0.1:54321/auth/v1/health"

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function log(msg: string) {
  console.log(`[prepare-stack] ${msg}`)
}

async function ensureSupabaseUp() {
  try {
    sh("npx", ["supabase", "start"])
    log("supabase start: ok")
  } catch (err) {
    // Already running / partially up both surface as a non-zero exit here.
    try {
      sh("npx", ["supabase", "status"])
      log("supabase start errored but `status` is healthy — continuing")
    } catch {
      console.error((err as { stdout?: string; stderr?: string }).stdout ?? "")
      console.error((err as { stderr?: string }).stderr ?? "")
      throw new Error("`supabase start` failed and the stack is not healthy")
    }
  }
}

async function waitForPostgres() {
  const deadline = Date.now() + PG_READY_TIMEOUT_MS
  for (;;) {
    try {
      await pool.query("select 1")
      log("postgres: ready")
      return
    } catch (err) {
      if (Date.now() > deadline) throw err
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

async function waitForAuth() {
  const deadline = Date.now() + PG_READY_TIMEOUT_MS
  for (;;) {
    try {
      const res = await fetch(AUTH_HEALTH_URL)
      if (res.ok) {
        log("auth: ready")
        return
      }
    } catch {
      /* retry */
    }
    if (Date.now() > deadline)
      throw new Error(`auth not ready at ${AUTH_HEALTH_URL}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function migrateIfFresh() {
  const [{ fresh }] = (
    await pool.query<{ fresh: boolean }>(
      "select to_regclass('public.classrooms') is null as fresh"
    )
  ).rows
  if (fresh) {
    log("fresh database — running `supabase db reset`")
    sh("npx", ["supabase", "db", "reset", "--local"])
    return
  }
  // Not fresh: assume migrations are applied. Warn (never fail) if the newest
  // migration file post-dates what's recorded as applied.
  try {
    const dir = path.resolve("supabase/migrations")
    const newest = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.split("_")[0])
      .sort()
      .at(-1)
    const [{ applied }] = (
      await pool.query<{ applied: string | null }>(
        "select max(version) as applied from supabase_migrations.schema_migrations"
      )
    ).rows
    if (newest && applied && newest > applied) {
      log(
        `WARNING: newest migration ${newest} is ahead of applied ${applied}. ` +
          "Run `npx supabase db reset` if specs fail with a missing column/table."
      )
    }
  } catch {
    /* schema_migrations shape varies; the warning is best-effort */
  }
}

async function ensureStudentsBucket() {
  await pool.query(
    `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
     values ('students', 'students', false, 5242880, array['image/webp'])
     on conflict (id) do nothing`
  )
  log("storage bucket 'students': ensured")
}

function resetAuthDir() {
  fs.rmSync(AUTH_DIR, { recursive: true, force: true })
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  log("playwright/.auth cleared")
}

async function main() {
  await ensureSupabaseUp()
  await waitForPostgres()
  await waitForAuth()
  await migrateIfFresh()
  await provisionAuthPool(pool, POOL_SIZE)
  log(`auth pool e2e-user-0..${POOL_SIZE - 1}: provisioned`)
  await ensureStudentsBucket()
  resetAuthDir()
  await pool.end()
  log("done")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
