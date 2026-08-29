import { expect, test } from "../../playwright/fixtures.ts"
import { gotoStable, waitForHydration } from "./helpers.ts"

/** Runs under the `empty-state` Playwright project: a pool user with no data. */

test("classrooms index shows the empty state", async ({ page }) => {
  await gotoStable(page, "/classrooms")
  await waitForHydration(page)
  await expect(page.getByText("No Classrooms Yet")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Create classroom" })
  ).toBeVisible()
})
