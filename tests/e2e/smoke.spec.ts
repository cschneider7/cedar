import { expect, test } from "../../playwright/fixtures.ts"
import { gotoStable, waitForSeatingChart } from "./helpers.ts"

/**
 * Every routeable page renders for a signed-in user with the canonical fixture
 * set: lands on the expected URL (some routes redirect) and shows a landmark,
 * with no uncaught page errors.
 */

test("no route throws an uncaught error and every landmark renders", async ({
  page,
  d,
}) => {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(String(err)))

  const cases: {
    path: string
    url: RegExp | string
    landmark: (p: typeof page) => unknown
  }[] = [
    {
      path: "/",
      url: "/",
      landmark: (p) => p.getByRole("button", { name: /account/i }),
    },
    {
      path: "/account",
      url: /\/account$/,
      landmark: (p) => p.getByRole("heading", { name: /account/i }),
    },
    {
      path: "/students",
      url: /\/students$/,
      landmark: (p) => p.getByLabel("Search students"),
    },
    {
      path: `/students/${d.student(1)}`,
      url: new RegExp(`/students/${d.student(1)}$`),
      landmark: (p) => p.getByRole("link", { name: /back to students/i }),
    },
    {
      path: "/students/new",
      url: /\/students$/,
      landmark: (p) => p.getByLabel("Search students"),
    },
    {
      path: "/classrooms",
      url: /\/classrooms$/,
      landmark: (p) => p.getByRole("button", { name: /create classroom/i }),
    },
    {
      path: `/classrooms/${d.classroomA}`,
      url: new RegExp(`/classrooms/${d.classroomA}$`),
      landmark: (p) => p.getByRole("heading", { name: "Homeroom" }),
    },
    {
      path: `/classrooms/${d.classroomA}/roster`,
      url: new RegExp(`/classrooms/${d.classroomA}/roster$`),
      landmark: (p) => p.getByLabel("Search roster"),
    },
    {
      path: `/classrooms/${d.classroomA}/seating-chart`,
      url: new RegExp(`/classrooms/${d.classroomA}/seating-chart$`),
      landmark: (p) => p.getByRole("button", { name: "Edit seating chart" }),
    },
    {
      path: `/classrooms/${d.classroomA}/cold-call`,
      url: new RegExp(`/classrooms/${d.classroomA}/cold-call$`),
      landmark: (p) => p.getByText("Probabilities"),
    },
    {
      path: `/classrooms/${d.classroomA}/edit`,
      url: /\/classrooms$/,
      landmark: (p) => p.getByRole("button", { name: /create classroom/i }),
    },
    {
      path: "/login",
      url: /\/login$/,
      landmark: (p) => p.getByRole("button", { name: "Log in" }),
    },
    {
      path: "/signup",
      url: /\/signup$/,
      landmark: (p) => p.getByRole("button", { name: "Sign up" }),
    },
    {
      path: "/forgot-password",
      url: /\/forgot-password$/,
      landmark: (p) => p.getByRole("button", { name: /send reset link/i }),
    },
    {
      // Signed in, so the loader renders the form rather than bouncing to
      // /forgot-password (that redirect is covered signed-out in auth.spec).
      path: "/reset-password",
      url: /\/reset-password$/,
      landmark: (p) => p.getByRole("button", { name: /reset password/i }),
    },
  ]

  for (const { path, url, landmark } of cases) {
    await test.step(path, async () => {
      await gotoStable(page, path)
      await expect(page).toHaveURL(
        typeof url === "string" ? new RegExp(`${url}$`) : url
      )
      await expect(
        landmark(page) as ReturnType<typeof page.getByText>
      ).toBeVisible()
    })
  }

  expect(errors).toEqual([])
})

test("seeded seating chart renders its saved tables", async ({ page, d }) => {
  await page.goto(`/classrooms/${d.classroomC}/seating-chart`)
  await waitForSeatingChart(page)
  await expect(page.locator(".react-flow__node-table")).toHaveCount(2)
})
