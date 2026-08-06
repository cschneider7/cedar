import { setupClerkTestingToken } from "@clerk/testing/playwright"
import { expect, test } from "@playwright/test"

// Set CLERK_TEST_EMAIL/CLERK_TEST_PASSWORD (a real test-mode Clerk user) in
// .env to run the sign-in/sign-out test — see .env.example. The device
// verification step, when Clerk shows it, always accepts "424242" for
// test-mode accounts.
const email = process.env.CLERK_TEST_EMAIL
const password = process.env.CLERK_TEST_PASSWORD

test("redirects an unauthenticated visitor to /login", async ({ page }) => {
  await page.goto("/students")
  await expect(page).toHaveURL(/\/login$/)
})

test("signs in, lands on /, and can sign out", async ({ page }) => {
  test.skip(
    !email || !password,
    "Set CLERK_TEST_EMAIL/CLERK_TEST_PASSWORD in .env to run this test"
  )

  await setupClerkTestingToken({ page })

  await page.goto("/login")
  await page.getByRole("textbox", { name: /email/i }).fill(email!)
  await page.getByRole("button", { name: /continue/i }).click()
  await page.getByRole("textbox", { name: /password/i }).fill(password!)
  await page.getByRole("button", { name: /continue/i }).click()

  // Clerk sometimes asks for a device-verification code on an unrecognized
  // device — test-mode accounts always accept "424242".
  const sawDeviceVerification = await page
    .getByText(/check your email/i)
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  if (sawDeviceVerification) {
    await page.locator("input").first().click()
    await page.keyboard.type("424242")
  }

  await expect(page).toHaveURL("/", { timeout: 10000 })

  await page.getByRole("button", { name: /account menu/i }).click()
  await page.getByRole("menuitem", { name: /sign out/i }).click()
  // The topbar's "Sign in" control is a Base UI Button rendered as an <a>
  // (nativeButton={false}) — Base UI reports it with role="button", not "link".
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
})
