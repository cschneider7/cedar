import { expect, test } from "@playwright/test"

import { fillHydrated, submitLogin, waitForHydration } from "./helpers.ts"

/**
 * Signed-out flows. These import from `@playwright/test` directly (not
 * `playwright/fixtures`) so no worker login or per-test reseed runs — every test
 * here starts with no session.
 */

const email = process.env.SUPABASE_AUTH_TEST_EMAIL
const password = process.env.SUPABASE_AUTH_TEST_PASSWORD

test("redirects an unauthenticated visitor to sign-in", async ({ page }) => {
  await page.goto("/students")
  await expect(page).toHaveURL(/\/login/)
})

for (const path of ["/account", "/classrooms", "/classrooms/anything/roster"]) {
  test(`redirects unauthenticated ${path} to sign-in`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  })
}

test("login form shows validation errors on empty submit", async ({ page }) => {
  await page.goto("/login")
  await waitForHydration(page)
  await page.getByRole("button", { name: /log in/i }).click()
  await expect(page.getByText(/enter a valid email address/i)).toBeVisible()
  await expect(page.getByText(/password is required/i)).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test("login rejects bad credentials", async ({ page }) => {
  await page.goto("/login")
  await submitLogin(page, "nobody@example.com", "wrong-password")
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test("login shows the Google OAuth button pointing at the right provider", async ({
  page,
}) => {
  await page.route("**/auth/v1/authorize**", (route) => route.abort())
  await page.goto("/login")
  await waitForHydration(page)
  const googleButton = page.getByRole("button", {
    name: /continue with google/i,
  })
  await expect(googleButton).toBeVisible()

  const authorizeRequest = page.waitForRequest("**/auth/v1/authorize**")
  await googleButton.click()
  const request = await authorizeRequest
  expect(request.url()).toContain("provider=google")
})

test("signup form shows validation errors (no account created)", async ({
  page,
}) => {
  await page.goto("/signup")
  await waitForHydration(page)
  await page.getByRole("button", { name: /sign up/i }).click()
  await expect(page.getByText(/enter a valid email address/i)).toBeVisible()
  await expect(page).toHaveURL(/\/signup/)
})

test("forgot-password submit shows the generic confirmation", async ({
  page,
}) => {
  await page.goto("/forgot-password")
  await fillHydrated(page.getByLabel(/email/i), "someone@example.com")
  await page.getByRole("button", { name: /send reset link/i }).click()
  await expect(page.getByText(/check your email/i)).toBeVisible()
})

test("reset-password without a recovery session redirects to forgot-password", async ({
  page,
}) => {
  await page.goto("/reset-password")
  await expect(page).toHaveURL(/\/forgot-password/)
})

test("signs in, lands on /, and can sign out", async ({ page }) => {
  test.skip(
    !email || !password,
    "Set SUPABASE_AUTH_TEST_EMAIL/SUPABASE_AUTH_TEST_PASSWORD in .env to run this test"
  )

  await page.goto("/login")
  await submitLogin(page, email!, password!)

  await expect(page).toHaveURL("/")

  await page.getByRole("button", { name: /account/i }).click()
  await page.getByRole("menuitem", { name: /sign out/i }).click()
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
})
