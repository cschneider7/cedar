import { expect, test } from "@playwright/test"

const email = process.env.NEON_AUTH_TEST_EMAIL!
const password = process.env.NEON_AUTH_TEST_PASSWORD!

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
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
})
