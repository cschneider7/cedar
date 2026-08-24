import { expect, test } from "@playwright/test"

// Set NEON_AUTH_TEST_EMAIL/NEON_AUTH_TEST_PASSWORD (a real, already-seeded
// Neon Auth account) in .env to run the sign-in/sign-out test — see
// .env.example. Unlike Clerk, Neon Auth has no testing-token bypass, so
// this drives the actual rendered sign-in form.
const email = process.env.NEON_AUTH_TEST_EMAIL
const password = process.env.NEON_AUTH_TEST_PASSWORD

test("redirects an unauthenticated visitor to /login", async ({ page }) => {
  await page.goto("/students")
  await expect(page).toHaveURL(/\/login$/)
})

test("signs in, lands on /, and can sign out", async ({ page }) => {
  test.skip(
    !email || !password,
    "Set NEON_AUTH_TEST_EMAIL/NEON_AUTH_TEST_PASSWORD in .env to run this test"
  )

  await page.goto("/login")
  await page.getByLabel(/email/i).fill(email!)
  await page.getByLabel(/^password$/i).fill(password!)
  await page.getByRole("button", { name: /login/i }).click()

  await expect(page).toHaveURL("/", { timeout: 10000 })

  await page.getByRole("button", { name: /account menu/i }).click()
  await page.getByRole("menuitem", { name: /sign out/i }).click()
  // The topbar's "Sign in" control is a Base UI Button rendered as an <a>
  // (nativeButton={false}) — Base UI reports it with role="button", not "link".
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
})
