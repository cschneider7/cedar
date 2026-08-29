import { expect, test } from "../../playwright/fixtures.ts"
import { gotoStable, waitForHydration } from "./helpers.ts"

/** Runs under the `empty-state` Playwright project: a pool user with no data. */

test("students index shows the empty state", async ({ page }) => {
  await gotoStable(page, "/students")
  await waitForHydration(page)
  await expect(page.getByText("No students yet")).toBeVisible()
  await expect(
    page.getByText(/get started by adding your first student/i)
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Add Student" }).last()
  ).toBeVisible()
})

test("home renders for a user with no data", async ({ page }) => {
  await gotoStable(page, "/")
  await waitForHydration(page)
  await expect(page.getByRole("button", { name: /account/i })).toBeVisible()
})
