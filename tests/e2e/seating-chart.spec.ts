import { expect, test } from "../../playwright/fixtures.ts"
import {
  boundary,
  enterSeatingEditMode,
  gotoStable,
  seatCount,
  seatedStudentCount,
  tableCount,
  waitForSeatingChart,
} from "./helpers.ts"

const tableNodes = ".react-flow__node-table"
const seatNodes = ".react-flow__node-seat"

async function openChart(
  page: import("@playwright/test").Page,
  classroomId: string
) {
  await gotoStable(page, `/classrooms/${classroomId}/seating-chart`)
  await waitForSeatingChart(page)
}

async function addTable(page: import("@playwright/test").Page) {
  await page.getByLabel("More Options").click()
  await page.getByRole("menuitem", { name: "Add Table" }).click()
}

test("enter and cancel edit mode", async ({ page, d }) => {
  await openChart(page, d.classroomB)
  await enterSeatingEditMode(page)
  await expect(
    page.getByRole("button", { name: "Cancel seating chart changes" })
  ).toBeVisible()

  await page
    .getByRole("button", { name: "Cancel seating chart changes" })
    .click()
  await expect(
    page.getByRole("button", { name: "Edit seating chart" })
  ).toBeVisible()
})

test("add a table, save, and reload", async ({ page, d }) => {
  await openChart(page, d.classroomB)
  await expect(page.locator(tableNodes)).toHaveCount(0)

  await enterSeatingEditMode(page)
  await addTable(page)
  await expect(page.locator(tableNodes)).toHaveCount(1)

  await page.getByRole("button", { name: "Save seating chart" }).click()
  await expect(
    page.getByRole("button", { name: "Edit seating chart" })
  ).toBeVisible()

  expect(await tableCount(d.classroomB)).toBe(1)
  expect(await seatCount(d.classroomB)).toBeGreaterThan(0)

  await openChart(page, d.classroomB)
  await expect(page.locator(tableNodes)).toHaveCount(1)
})

test("grow a table's grid with the row stepper", async ({ page, d }) => {
  await openChart(page, d.classroomB)
  await enterSeatingEditMode(page)
  await addTable(page)

  await page.locator(tableNodes).first().click()
  await expect(page.locator(seatNodes)).toHaveCount(4) // default 2x2

  await page.getByRole("button", { name: "Add row" }).click()
  await expect(page.locator(seatNodes)).toHaveCount(6) // 3x2

  await page.getByRole("button", { name: "Save seating chart" }).click()
  await expect(
    page.getByRole("button", { name: "Edit seating chart" })
  ).toBeVisible()

  await openChart(page, d.classroomB)
  await expect(page.locator(seatNodes)).toHaveCount(6)
})

test("delete a table from its node toolbar", async ({ page, d }) => {
  await openChart(page, d.classroomC)
  await expect(page.locator(tableNodes)).toHaveCount(2)

  await enterSeatingEditMode(page)
  await page.locator(tableNodes).first().click()
  await page.getByRole("button", { name: "Delete" }).click()

  const confirm = page.getByRole("alertdialog")
  await confirm.getByRole("button", { name: "Delete" }).click()
  await expect(page.locator(tableNodes)).toHaveCount(1)

  await page.getByRole("button", { name: "Save seating chart" }).click()
  await expect(
    page.getByRole("button", { name: "Edit seating chart" })
  ).toBeVisible()
  expect(await tableCount(d.classroomC)).toBe(1)
})

test("edit the boundary size", async ({ page, d }) => {
  await openChart(page, d.classroomC)
  await enterSeatingEditMode(page)

  await page.getByLabel("More Options").click()
  await page.getByRole("menuitem", { name: "Boundary Size" }).click()

  // The inputs enforce `step={GRID_STEP}` (20) off a table-derived `min`
  // (670×290 for this fixture), so the values must land on that grid.
  const dialog = page.getByRole("dialog", { name: "Boundary Size" })
  await dialog.getByLabel("Width").fill("1390")
  await dialog.getByLabel("Height").fill("1010")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Save seating chart" }).click()
  await expect(
    page.getByRole("button", { name: "Edit seating chart" })
  ).toBeVisible()

  expect(await boundary(d.classroomC)).toEqual({ width: 1390, height: 1010 })
})

test("unassign all students", async ({ page, d }) => {
  await openChart(page, d.classroomC)
  expect(await seatedStudentCount(d.classroomC)).toBe(2)

  await enterSeatingEditMode(page)
  await page.getByLabel("More Options").click()
  await page.getByRole("menuitem", { name: "Unassign All Students" }).click()
  await page
    .getByRole("alertdialog", { name: "Unassign all students?" })
    .getByRole("button", { name: "Unassign All" })
    .click()

  await page.getByRole("button", { name: "Save seating chart" }).click()
  await expect(
    page.getByRole("button", { name: "Edit seating chart" })
  ).toBeVisible()

  expect(await seatedStudentCount(d.classroomC)).toBe(0)
  expect(await tableCount(d.classroomC)).toBe(2)
})

test("randomize seats every student, then persist", async ({ page, d }) => {
  await openChart(page, d.classroomC)
  await enterSeatingEditMode(page)

  await page.getByLabel("More Options").click()
  await page.getByRole("menuitem", { name: "Randomize Seating Chart" }).click()

  const dialog = page.getByRole("dialog", { name: "Randomize Seating Chart" })
  await dialog.getByRole("button", { name: "Generate" }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Save seating chart" }).click()
  await expect(
    page.getByRole("button", { name: "Edit seating chart" })
  ).toBeVisible()

  // Structural invariant: every Lab student ends up seated.
  expect(await seatedStudentCount(d.classroomC)).toBe(4)
})

test("cancel discards unsaved table additions", async ({ page, d }) => {
  await openChart(page, d.classroomB)
  await enterSeatingEditMode(page)
  await addTable(page)
  await expect(page.locator(tableNodes)).toHaveCount(1)

  await page
    .getByRole("button", { name: "Cancel seating chart changes" })
    .click()
  // A discard-confirm dialog may appear.
  const discard = page.getByRole("alertdialog", {
    name: /discard unsaved changes/i,
  })
  if (await discard.isVisible().catch(() => false)) {
    await discard.getByRole("button", { name: "Discard" }).click()
  }

  await openChart(page, d.classroomB)
  await expect(page.locator(tableNodes)).toHaveCount(0)
  expect(await tableCount(d.classroomB)).toBe(0)
})
