import { defineConfig, devices } from "@playwright/test"

// NEON_AUTH_TEST_EMAIL/PASSWORD (a real seeded Neon Auth account) are read
// directly off process.env by tests/e2e/auth.spec.ts — load .env the same
// way docker-compose's env_file does, since Playwright doesn't read it
// automatically.
try {
  process.loadEnvFile(".env")
} catch {
  // .env is optional locally (e.g. CI supplies these as real env vars)
}

// Requires the dev stack already running (`npm run dev` + backend, or
// `docker compose up`) — not auto-started here since the full app needs
// the Rust backend + Postgres, not just the Vite dev server.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
