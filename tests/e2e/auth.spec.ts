import { expect, test } from "@playwright/test"

const email = process.env.SUPABASE_AUTH_TEST_EMAIL!
const password = process.env.SUPABASE_AUTH_TEST_PASSWORD!

test("redirects an unauthenticated visitor to sign-in", async ({ page }) => {
  await page.goto("/students")
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
})

test("signs in, lands on /, and can sign out", async ({ page }) => {
  test.skip(
    !email || !password,
    "Set SUPABASE_AUTH_TEST_EMAIL/SUPABASE_AUTH_TEST_PASSWORD in .env to run this test"
  )

  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  await page.getByLabel(/email/i).fill(email!)
  await page.getByLabel(/^password$/i).fill(password!)
  await page.getByRole("button", { name: /log in/i }).click()

  await expect(page).toHaveURL("/", { timeout: 10000 })

  await page.getByRole("button", { name: /account/i }).click()
  await page.getByRole("menuitem", { name: /sign out/i }).click()
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
})
