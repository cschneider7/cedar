import path from "node:path"

import { expect, test } from "../../playwright/fixtures.ts"
import { query } from "./db.ts"
import {
  gotoStable,
  storageObjectCount,
  studentImageUrl,
  waitForHydration,
} from "./helpers.ts"

/**
 * Real photo upload against local Supabase Storage's S3-compatible endpoint
 */

const ASSET = path.resolve("tests/e2e/assets/avatar.png")

test("uploads a student photo end to end", async ({ page, d }) => {
  await gotoStable(page, "/students")
  await waitForHydration(page)

  await page.getByRole("button", { name: /add student/i }).click()
  const dialog = page.getByRole("dialog", { name: "Create new student" })
  await expect(dialog).toBeVisible()

  await dialog.locator('input[type="file"]').setInputFiles(ASSET)

  const crop = page.getByRole("dialog", { name: "Crop photo" })
  await expect(crop).toBeVisible()
  await crop.getByRole("button", { name: "Use photo" }).click()
  await expect(crop).toBeHidden()

  await dialog.getByPlaceholder("Bob Burger").fill("Photog Student")
  await dialog.getByPlaceholder("123456").fill("70123")
  await dialog.getByRole("button", { name: "Submit" }).click()
  await expect(dialog).toBeHidden()

  await expect
    .poll(
      async () =>
        (
          await query<{ id: string }>(
            "select id from students where user_id = $1 and name = $2",
            [d.userId, "Photog Student"]
          )
        ).length
    )
    .toBe(1)

  const [{ id: studentId }] = await query<{ id: string }>(
    "select id from students where user_id = $1 and name = $2",
    [d.userId, "Photog Student"]
  )

  await expect
    .poll(() => studentImageUrl(studentId))
    .toMatch(new RegExp(`^students/${d.userId}/[0-9a-f-]+\\.webp$`))
  expect(await storageObjectCount(d.userId)).toBeGreaterThanOrEqual(1)

  // The authenticated image proxy serves it back and the avatar renders.
  await gotoStable(page, `/students/${studentId}`)
  await waitForHydration(page)
  const img = page.locator('img[alt=""]').first()
  await expect(img).toBeVisible()
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0)
})
