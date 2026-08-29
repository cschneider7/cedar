import { expect, test } from "../../playwright/fixtures.ts"
import {
  gotoStable,
  paginationNext,
  reloadHydrated,
  waitForHydration,
} from "./helpers.ts"

/** 29 canonical students: 24 on Homeroom, 4 on Lab, 1 unassigned. */
const TOTAL = 29

test.beforeEach(async ({ page }) => {
  await gotoStable(page, "/students")
  await waitForHydration(page)
})

test("grid/list toggle persists via cookie", async ({ page, context }) => {
  const viewCookie = async () =>
    (await context.cookies()).find((c) => c.name === "students-view-mode")
      ?.value

  // Default is grid: cards, no table.
  await expect(page.getByRole("table")).toBeHidden()

  await page.getByLabel("List view").click()
  await expect(page).toHaveURL(/view=list/)
  await expect(page.getByRole("table")).toBeVisible()
  expect(await viewCookie()).toBe("list")

  // Persisted: a fresh visit with no ?view param still renders list.
  await gotoStable(page, "/students")
  await waitForHydration(page)
  await expect(page.getByRole("table")).toBeVisible()

  await page.getByLabel("Grid view").click()
  await expect(page).toHaveURL(/view=grid/)
  await expect(page.getByRole("table")).toBeHidden()
  expect(await viewCookie()).toBe("grid")

  await gotoStable(page, "/students")
  await waitForHydration(page)
  await expect(page.getByRole("table")).toBeHidden()
})

test("?view=list overrides the default", async ({ page }) => {
  await gotoStable(page, "/students?view=list")
  await expect(page.getByRole("table")).toBeVisible()
})

test("server-side pagination in list view", async ({ page }) => {
  await gotoStable(page, "/students?view=list")
  await waitForHydration(page)
  await expect(
    page.getByText(`Showing 1–20 of ${TOTAL} students`)
  ).toBeVisible()

  await paginationNext(page).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(
    page.getByText(`Showing 21–${TOTAL} of ${TOTAL} students`)
  ).toBeVisible()
})

test("server-side pagination in grid view", async ({ page }) => {
  await expect(
    page.getByText(`Showing 1–24 of ${TOTAL} students`)
  ).toBeVisible()
  await paginationNext(page).click()
  await expect(
    page.getByText(`Showing 25–${TOTAL} of ${TOTAL} students`)
  ).toBeVisible()
})

test("search filters server-side", async ({ page }) => {
  await page.getByLabel("Search students").fill("Unassigned")
  await expect(page.getByText("Showing 1–1 of 1 students")).toBeVisible()
  await expect(page.getByText("Unassigned Student")).toBeVisible()

  await page.getByLabel("Search students").fill("")
  await expect(
    page.getByText(`Showing 1–24 of ${TOTAL} students`)
  ).toBeVisible()
})

test("search empty state", async ({ page }) => {
  await page.getByLabel("Search students").fill("zzzznotachance")
  await expect(page.getByText("No students found")).toBeVisible()
})

test("create a student via the dialog", async ({ page }) => {
  await page.getByRole("button", { name: /add student/i }).click()
  const dialog = page.getByRole("dialog", { name: "Create new student" })
  await expect(dialog).toBeVisible()

  await dialog.getByPlaceholder("Bob Burger").fill("Newton Newkirk")
  await dialog.getByPlaceholder("123456").fill("77001")
  await dialog.getByRole("button", { name: "Submit" }).click()

  await expect(page.getByText("Student created")).toBeVisible()
  await expect(dialog).not.toBeVisible()

  await page.getByLabel("Search students").fill("Newton Newkirk")
  await expect(page.getByText("Newton Newkirk")).toBeVisible()
})

test("edit a student from the row menu", async ({ page }) => {
  await gotoStable(page, "/students?view=list&q=Homeroom+Student+01")
  await waitForHydration(page)

  await page
    .getByRole("button", { name: "Actions for Homeroom Student 01" })
    .click()
  await page.getByRole("menuitem", { name: "Edit" }).click()

  const dialog = page.getByRole("dialog", { name: "Edit student" })
  await expect(dialog).toBeVisible()
  await dialog
    .getByPlaceholder("Bob Burger")
    .fill("Homeroom Student 01 (edited)")
  await dialog.getByRole("button", { name: "Submit" }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText("Homeroom Student 01 (edited)")).toBeVisible()
})

test("delete a student from the row menu", async ({ page }) => {
  await gotoStable(page, "/students?view=list&q=Homeroom+Student+01")
  await waitForHydration(page)

  await page
    .getByRole("button", { name: "Actions for Homeroom Student 01" })
    .click()
  await page.getByRole("menuitem", { name: "Delete" }).click()

  const dialog = page.getByRole("alertdialog", {
    name: "Delete Homeroom Student 01?",
  })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Delete" }).click()

  // The row (and its toast effect) unmount on revalidation, so assert the
  // outcome rather than the fleeting toast.
  await expect(page.getByText("No students found")).toBeVisible()
})

test("bulk delete a selection in list view", async ({ page }) => {
  await gotoStable(page, "/students?view=list")
  await waitForHydration(page)

  for (const n of ["02", "03", "04"]) {
    await page.getByLabel(`Select Homeroom Student ${n}`).click()
  }
  await expect(page.getByText("3 selected")).toBeVisible()

  await page.getByRole("button", { name: "Delete", exact: true }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog.getByText("Delete 3 students?")).toBeVisible()
  await dialog.getByRole("button", { name: "Delete" }).click()

  await expect(page.getByText("3 students deleted")).toBeVisible()
  await expect(
    page.getByText(`Showing 1–20 of ${TOTAL - 3} students`)
  ).toBeVisible()
})

test("open a student's detail page from the grid", async ({ page, d }) => {
  await page.getByLabel("Search students").fill("Homeroom Student 05")
  await page.getByRole("link", { name: /homeroom student 05/i }).click()
  await expect(page).toHaveURL(new RegExp(`/students/${d.student(5)}$`))
  await expect(page.getByText("Student ID: 5")).toBeVisible()
})
