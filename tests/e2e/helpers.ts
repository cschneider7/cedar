import type { APIRequestContext, Locator, Page } from "@playwright/test"
import { expect } from "@playwright/test"

import { query } from "./db.ts"
import { ROSTER_A_SIDS } from "./fixtures.ts"

export { ids } from "./fixtures.ts"

/**
 * Wait for React Router's client hydration to finish
 */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () =>
      (window as unknown as { __reactRouterDataRouter?: unknown })
        .__reactRouterDataRouter !== undefined
  )
}

/**
 * Fill a field once the page has hydrated
 */
export async function fillHydrated(locator: Locator, value: string) {
  await waitForHydration(locator.page())
  await locator.fill(value)
  await expect(locator).toHaveValue(value)
}

/**
 * `page.reload()` then wait for hydration
 */
export async function reloadHydrated(page: Page) {
  await page.reload()
  await waitForHydration(page)
}

/**
 * The app's shadcn pagination renders `role="button"` (not link) via Base UI.
 * Next/previous page controls.
 */
export function paginationNext(page: Page): Locator {
  return page.getByRole("button", { name: "Go to next page" })
}
export function paginationPrev(page: Page): Locator {
  return page.getByRole("button", { name: "Go to previous page" })
}

/**
 * `page.goto` that tolerates `net::ERR_ABORTED` — the Vite dev server can abort a
 * full navigation when a previous route's manifest-patch / chunk fetch is still
 * in flight, which shows up under rapid sequential navigation.
 */
export async function gotoStable(page: Page, path: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(path)
      return
    } catch (err) {
      if (attempt >= 2 || !String(err).includes("ERR_ABORTED")) throw err
      await page.waitForTimeout(300)
    }
  }
}

/**
 * Drive the real `/login` form. Assumes the page is already at `/login`
 */
export async function submitLogin(page: Page, email: string, password: string) {
  await waitForHydration(page)
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/^password$/i).fill(password)
  await expect(page.getByLabel(/email/i)).toHaveValue(email)
  await page.getByRole("button", { name: /log in/i }).click()
}

type ClassroomTab = "overview" | "roster" | "seating-chart" | "cold-call"

/**
 * Names on Classroom A's canonical roster, in roster-number order
 */
export function rosterANames(): string[] {
  return ROSTER_A_SIDS.map(
    (sid) => `Homeroom Student ${String(sid).padStart(2, "0")}`
  )
}

export async function tableCount(classroomId: string): Promise<number> {
  const rows = await query<{ n: number }>(
    "select count(*)::int as n from tables where classroom_id = $1",
    [classroomId]
  )
  return rows[0].n
}

export async function seatCount(classroomId: string): Promise<number> {
  const rows = await query<{ n: number }>(
    `select count(*)::int as n from seats s
       join tables t on t.id = s.table_id
      where t.classroom_id = $1`,
    [classroomId]
  )
  return rows[0].n
}

export async function seatedStudentCount(classroomId: string): Promise<number> {
  const rows = await query<{ n: number }>(
    `select count(*)::int as n from seats s
       join tables t on t.id = s.table_id
      where t.classroom_id = $1 and s.student_id is not null`,
    [classroomId]
  )
  return rows[0].n
}

export async function boundary(
  classroomId: string
): Promise<{ width: number; height: number }> {
  const rows = await query<{ width: number; height: number }>(
    "select boundary_width as width, boundary_height as height from classrooms where id = $1",
    [classroomId]
  )
  return rows[0]
}

export async function studentImageUrl(
  studentId: string
): Promise<string | null> {
  const rows = await query<{ image_url: string | null }>(
    "select image_url from students where id = $1",
    [studentId]
  )
  return rows[0]?.image_url ?? null
}

export async function storageObjectCount(userId: string): Promise<number> {
  const rows = await query<{ n: number }>(
    `select count(*)::int as n from storage.objects
      where bucket_id = 'students' and name like 'students/' || $1 || '/%'`,
    [userId]
  )
  return rows[0].n
}

export async function gotoClassroomTab(
  page: Page,
  classroomId: string,
  tab: ClassroomTab
) {
  const suffix = tab === "overview" ? "" : `/${tab}`
  await page.goto(`/classrooms/${classroomId}${suffix}`)
}

/**
 * The classroom detail tab links. A pinned classroom also renders the same four
 * link labels in the sidebar, so scope to the page's own `<main>`.
 */
export function classroomTab(page: Page, label: string): Locator {
  return page
    .getByRole("main")
    .last()
    .getByRole("link", { name: label, exact: true })
}

/**
 * Wait for the React Flow canvas to finish its first render. The boundary node
 * always mounts; nodes only appear after hydration + a layout measure, which can
 * outlast a default 5s assertion timeout under parallel load.
 */
export async function waitForSeatingChart(page: Page) {
  await waitForHydration(page)
  await expect(page.locator(".react-flow__node-boundary")).toBeAttached({
    timeout: 15_000,
  })
}

/**
 * Click "Edit Chart" and wait for edit mode (Save button visible)
 */
export async function enterSeatingEditMode(page: Page) {
  await page.getByRole("button", { name: "Edit seating chart" }).click()
  await expect(
    page.getByRole("button", { name: "Save seating chart" })
  ).toBeVisible()
}

/**
 * Create a classroom straight through the API — fast setup for bulk scenarios
 */
export async function createClassroomViaApi(
  request: APIRequestContext,
  token: string,
  fields: {
    subject: string
    period: number
    term_season?: string
    term_year?: number
  }
): Promise<string> {
  const res = await request.post("http://localhost:3001/api/v1/classrooms", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      term_season: "fall",
      term_year: 2026,
      ...fields,
    },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).data.id
}
