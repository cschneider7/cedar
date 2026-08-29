import fs from "node:fs"
import path from "node:path"

import { test as base, expect, type TestInfo } from "@playwright/test"

import {
  deleteUserData,
  ids,
  poolUserCredentials,
  reseedUser,
} from "../tests/e2e/fixtures.ts"
import { submitLogin } from "../tests/e2e/helpers.ts"

type Ids = ReturnType<typeof ids>

const AUTH_DIR = path.resolve("playwright/.auth")

type Variant = "canonical" | "empty"

function variantFor(info: TestInfo): Variant {
  return (info.project.metadata?.variant as Variant | undefined) ?? "canonical"
}

function userIndexFor(info: TestInfo): number {
  const base = (info.project.metadata?.userIndexBase as number | undefined) ?? 0
  // The empty-state project shares one fixed account across its workers (its
  // specs are read-only and the reseed just deletes) — Playwright can't cap a
  // single project's worker count, so we can't rely on parallelIndex here.
  if (variantFor(info) === "empty") return base
  return base + info.parallelIndex
}

type TestFixtures = {
  /** Set `test.use({ reseed: false })` to skip the per-test data reset. */
  reseed: boolean
  _autoReseed: void
  /** This worker's pool-user index. */
  userIndex: number
  /** Deterministic fixture ids for this worker's pool user. */
  d: Ids
}

type WorkerFixtures = {
  /** Path to a cached storage-state file for this worker's pool user. */
  workerStorageState: string
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  reseed: [true, { option: true }],

  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  workerStorageState: [
    async ({ browser }, use) => {
      const info = test.info()
      const idx = userIndexFor(info)
      fs.mkdirSync(AUTH_DIR, { recursive: true })
      const file = path.join(AUTH_DIR, `${idx}.json`)

      if (!fs.existsSync(file)) {
        const { email, password } = poolUserCredentials(idx)
        const baseURL =
          (info.project.use.baseURL as string | undefined) ??
          "http://localhost:5173"

        let lastErr: unknown
        for (let attempt = 0; attempt < 3; attempt++) {
          const page = await browser.newPage({
            storageState: undefined,
            baseURL,
          })
          try {
            await page.goto("/login")
            await submitLogin(page, email, password)
            await page.waitForURL("/", { timeout: 20_000 })
            await expect(
              page.getByRole("button", { name: /account/i })
            ).toBeVisible()
            // Reload so the SSR session middleware writes the canonical (chunked)
            // sb-cedar-auth-token cookies, not just the browser-client-set ones.
            await page.reload()
            await expect(
              page.getByRole("button", { name: /account/i })
            ).toBeVisible()
            await page.context().storageState({ path: file })
            await page.close()
            lastErr = undefined
            break
          } catch (err) {
            lastErr = err
            await page.close()
          }
        }
        if (lastErr) throw lastErr
      }

      await use(file)
    },
    { scope: "worker" },
  ],

  userIndex: async ({}, use) => {
    await use(userIndexFor(test.info()))
  },

  d: async ({ userIndex }, use) => {
    await use(ids(userIndex))
  },

  _autoReseed: [
    async ({ reseed }, use) => {
      const info = test.info()
      if (reseed) {
        const idx = userIndexFor(info)
        await deleteUserData(idx)
        if (variantFor(info) === "canonical") await reseedUser(idx)
      }
      await use()
    },
    { auto: true },
  ],
})

export { expect }
