import { execFileSync } from "node:child_process"

import { defineConfig, devices } from "@playwright/test"

try {
  process.loadEnvFile(".env")
} catch {
  // .env is optional locally (e.g. CI supplies these as real env vars)
}

const POOL_SIZE = Number(process.env.E2E_USER_POOL_SIZE ?? 6)

const POSTGRES_URL =
  process.env.POSTGRES_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable"
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321"

/**
 * Backend blob layer that talks to local Supabase's S3-compatible endpoint
 */
function resolveStorageS3() {
  const fallback = {
    S3_ENDPOINT: "http://127.0.0.1:54321/storage/v1/s3/",
    S3_REGION: "local",
    S3_ACCESS_KEY_ID: "625729a08b95bf1b7ff351a663f3a23c",
    S3_SECRET_ACCESS_KEY:
      "850181e4652dd023b7a98c58ae0d2d34bd487ee0cc3254aed6eda37307425907",
  }
  try {
    const env = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    const read = (key: string) =>
      env.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, "m"))?.[1]
    return {
      S3_ENDPOINT: (
        read("STORAGE_S3_URL") ?? "http://127.0.0.1:54321/storage/v1/s3"
      ).replace(/\/?$/, "/"),
      S3_REGION: read("S3_PROTOCOL_REGION") ?? fallback.S3_REGION,
      S3_ACCESS_KEY_ID:
        read("S3_PROTOCOL_ACCESS_KEY_ID") ?? fallback.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY:
        read("S3_PROTOCOL_ACCESS_KEY_SECRET") ?? fallback.S3_SECRET_ACCESS_KEY,
    }
  } catch {
    return fallback
  }
}

const s3 = resolveStorageS3()

const backendEnv: Record<string, string> = {
  POSTGRES_URL,
  SUPABASE_URL,
  FRONTEND_ORIGIN: "http://localhost:5173",
  RUST_LOG: process.env.RUST_LOG ?? "class_management=info",
  S3_BUCKET: process.env.S3_BUCKET ?? "students",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? s3.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION ?? s3.S3_REGION,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? s3.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY:
    process.env.S3_SECRET_ACCESS_KEY ?? s3.S3_SECRET_ACCESS_KEY,
}

const chromium = devices["Desktop Chrome"]

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: POOL_SIZE - 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "cargo run --bin class_management",
      url: "http://localhost:3001/health",
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: backendEnv,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...chromium },
      metadata: { userIndexBase: 0, variant: "canonical" },
      testIgnore: /\.empty\.spec\.ts$/,
    },
    {
      name: "empty-state",
      use: { ...chromium },
      metadata: { userIndexBase: POOL_SIZE - 1, variant: "empty" },
      testMatch: /\.empty\.spec\.ts$/,
      fullyParallel: false,
    },
  ],
})
