import { describe, expect, it, vi } from "vitest"
import type { SeatingChart } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./classroom-seating-chart"

const classroomId = "classroom-1"

const actionArgs = (body: unknown) =>
  makeArgs(`http://test/classrooms/${classroomId}/seating-chart`, {
    method: "POST",
    params: { classroomId },
    body,
  })

stubFetch()

describe("classroom-seating-chart action", () => {
  const chart: SeatingChart = {
    boundary_width: 1080,
    boundary_height: 820,
    tables: [
      {
        table_number: 0,
        rows: 2,
        cols: 2,
        x_pos: 40,
        y_pos: 60,
        seat_assignments: [null, "s1", null, null],
      },
    ],
  }

  it("PUTs the seating chart payload straight through", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(actionArgs(chart))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(
      `http://localhost:3000/api/v1/classrooms/${classroomId}/seating-chart`
    )
    expect(init?.method).toBe("PUT")
    expect(JSON.parse(init?.body as string)).toEqual(chart)
    expect(result).toEqual({ ok: true })
  })

  it("returns the backend's message instead of throwing when the save fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Seat already taken" }), {
        status: 409,
      })
    )

    const result = await action(actionArgs(chart))

    expect(result).toEqual({ ok: false, error: "Seat already taken" })
  })
})
