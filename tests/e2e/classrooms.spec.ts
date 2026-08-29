import { expect, test } from "../../playwright/fixtures.ts"
import { query } from "./db.ts"
import {
  classroomTab,
  gotoStable,
  gotoClassroomTab,
  waitForHydration,
} from "./helpers.ts"

test.describe("index + CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await gotoStable(page, "/classrooms")
    await waitForHydration(page)
  })

  test("lists the fixture classrooms", async ({ page }) => {
    for (const subject of ["Homeroom", "Study Hall", "Lab"]) {
      await expect(
        page.getByRole("link", { name: `View ${subject}` })
      ).toBeVisible()
    }
    await expect(page.getByText("Showing 1–3 of 3 classrooms")).toBeVisible()
  })

  test("creates a classroom via the dialog", async ({ page }) => {
    await page.getByRole("button", { name: /create classroom/i }).click()
    const dialog = page.getByRole("dialog", { name: "Create new classroom" })
    await expect(dialog).toBeVisible()

    await dialog.getByPlaceholder("Math 2").fill("Physics")
    await dialog.getByText("Select a period").click()
    await page.getByRole("option", { name: "4", exact: true }).click()
    await dialog.getByText("Select a season").click()
    await page.getByRole("option", { name: "Fall" }).click()
    // Year defaults to the current year.
    await dialog.getByRole("button", { name: "Submit" }).click()

    await expect(page.getByText("Classroom created")).toBeVisible()
    await expect(page.getByRole("link", { name: "View Physics" })).toBeVisible()
  })

  test("edits a classroom from its detail header", async ({ page, d }) => {
    await gotoStable(page, `/classrooms/${d.classroomC}`)
    await waitForHydration(page)
    await page.getByRole("button", { name: "Edit classroom" }).click()

    const dialog = page.getByRole("dialog", { name: "Edit classroom" })
    await dialog.getByPlaceholder("Math 2").fill("Chemistry")
    await dialog.getByRole("button", { name: "Submit" }).click()

    await expect(page.getByText("Classroom updated")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Chemistry" })).toBeVisible()
  })

  test("deletes a classroom from the row menu", async ({ page }) => {
    await page.getByRole("button", { name: "Actions for Lab" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()

    const dialog = page.getByRole("alertdialog", {
      name: "Delete [FA26] Lab (Per 3)?",
    })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Delete" }).click()

    await expect(page.getByRole("link", { name: "View Lab" })).toBeHidden()
    await expect(page.getByText("Showing 1–2 of 2 classrooms")).toBeVisible()
  })
})

test.describe("pinning", () => {
  test("pin then unpin from the index updates the sidebar", async ({
    page,
  }) => {
    await gotoStable(page, "/classrooms")
    await waitForHydration(page)

    const sidebarEntry = page.getByRole("button", {
      name: "[FA26] Study Hall (Per 2)",
    })

    await page
      .getByRole("button", { name: "Add to Sidebar Study Hall" })
      .click()
    await expect(
      page.getByRole("button", { name: "Remove from Sidebar Study Hall" })
    ).toBeVisible()

    await gotoStable(page, "/classrooms")
    await waitForHydration(page)
    await expect(sidebarEntry).toBeVisible()

    await page
      .getByRole("button", { name: "Remove from Sidebar Study Hall" })
      .click()
    await expect(
      page.getByRole("button", { name: "Add to Sidebar Study Hall" })
    ).toBeVisible()

    await gotoStable(page, "/classrooms")
    await waitForHydration(page)
    await expect(sidebarEntry).toBeHidden()
  })

  test("blocks pinning past the limit", async ({ page, d }) => {
    // Seed 9 more pinned classrooms → 10 total (the cap) before touching the UI.
    for (let i = 0; i < 9; i++) {
      await query(
        `insert into classrooms (user_id, subject, period, term_season, term_year, pinned_at)
         values ($1, $2, $3, 'fall', 2026, now())`,
        [d.userId, `Filler ${i}`, i]
      )
    }
    await gotoStable(page, "/classrooms")
    await waitForHydration(page)

    await page
      .getByRole("button", { name: "Add to Sidebar Study Hall" })
      .click()
    await expect(
      page.getByText("You've reached the 10 pinned classroom limit.")
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Add to Sidebar Study Hall" })
    ).toBeVisible()
  })
})

test.describe("detail tabs", () => {
  test("navigates between the four tabs", async ({ page, d }) => {
    await gotoStable(page, `/classrooms/${d.classroomA}`)
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Period 1" })).toBeVisible()

    await classroomTab(page, "Roster").click()
    await expect(page).toHaveURL(
      new RegExp(`/classrooms/${d.classroomA}/roster$`)
    )
    await expect(page.getByLabel("Search roster")).toBeVisible()
    await expect(page.getByText("Showing 1–10 of 24 students")).toBeVisible()

    await classroomTab(page, "Cold Call").click()
    await expect(page.getByText("Probabilities")).toBeVisible()
    await expect(page.getByText("Selected Student")).toBeVisible()
  })

  test("roster: add the unassigned student to Study Hall", async ({
    page,
    d,
  }) => {
    await gotoClassroomTab(page, d.classroomB, "roster")
    await waitForHydration(page)
    await expect(page.getByText("No students yet")).toBeVisible()

    await page.getByRole("button", { name: "Add Students" }).click()
    const dialog = page.getByRole("dialog", { name: "Add Students" })
    await dialog.getByText("Unassigned Student").click()
    await dialog.getByRole("button", { name: /^Add \d+$/ }).click()

    await expect(page.getByText("Unassigned Student")).toBeVisible()
  })

  test("roster: unassign a student", async ({ page, d }) => {
    await gotoClassroomTab(page, d.classroomA, "roster")
    await waitForHydration(page)

    await page.getByLabel("Select Homeroom Student 01").click()
    await page.getByRole("button", { name: "Unassign" }).click()

    await expect(page.getByText("Homeroom Student 01")).toBeHidden()
  })

  test("cold call picks a roster student and updates the weights", async ({
    page,
    d,
  }) => {
    await gotoClassroomTab(page, d.classroomA, "cold-call")
    await waitForHydration(page)

    await page.getByRole("button", { name: /pick student/i }).click()

    const pickedName = await page
      .locator("p.text-lg.font-medium")
      .first()
      .textContent()
    expect(pickedName?.trim()).toMatch(/^Homeroom Student \d\d$/)

    await expect(
      page.getByRole("button", { name: /pick again/i })
    ).toBeVisible()
  })

  test("cold call empty state links to the roster", async ({ page, d }) => {
    await gotoClassroomTab(page, d.classroomB, "cold-call")
    await waitForHydration(page)
    await expect(page.getByText("No students yet")).toBeVisible()
    await expect(
      page.getByRole("link", { name: /go to roster/i })
    ).toBeVisible()
  })
})

test("topbar search finds a classroom and a student", async ({ page }) => {
  await gotoStable(page, "/")
  await waitForHydration(page)

  const search = page.getByLabel("Search classrooms and students")
  await search.fill("Homeroom")
  await expect(page.getByText("Classroom").first()).toBeVisible()

  await search.fill("Homeroom Student 03")
  await expect(page.getByText("Student").first()).toBeVisible()
})
