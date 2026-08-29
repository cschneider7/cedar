import os from "node:os"

import type { FullConfig } from "@playwright/test"

import { pool } from "./db.ts"

/**
 * Thin, Playwright-native setup: the heavy one-shot work (supabase start,
 * migrations, auth pool) is done by `tests/e2e/prepare-stack.ts` via the
 * `test:e2e` npm script.
 */
export default async function globalSetup(config: FullConfig) {
  const poolSize = Number(process.env.E2E_USER_POOL_SIZE ?? 6)

  let workers: number
  const raw = config.workers as number | string
  if (typeof raw === "string" && raw.trim().endsWith("%")) {
    workers = Math.max(
      1,
      Math.floor((parseFloat(raw) / 100) * os.cpus().length)
    )
  } else {
    workers = Number(raw) || 1
  }

  const usable = poolSize - 1 // highest index is reserved for the empty-state project
  if (workers > usable) {
    throw new Error(
      `Playwright is configured for ${workers} workers but the e2e user pool has ` +
        `only ${usable} usable accounts (E2E_USER_POOL_SIZE=${poolSize}, minus one ` +
        `reserved for empty-state). Raise E2E_USER_POOL_SIZE or run with ` +
        `--workers=${usable}.`
    )
  }

  try {
    await pool.query("select 1")
    const res = await fetch("http://127.0.0.1:54321/auth/v1/health")
    if (!res.ok) throw new Error("auth health check failed")
  } catch {
    throw new Error(
      "Local Supabase stack is not reachable. Run `npm run test:e2e` (it runs " +
        "tests/e2e/prepare-stack.ts first), or `node tests/e2e/prepare-stack.ts` by hand."
    )
  } finally {
    await pool.end()
  }
}
