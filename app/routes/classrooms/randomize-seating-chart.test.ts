import { describe, expect, it, vi } from "vitest"
import type { SeatingChart } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./randomize-seating-chart"

const classroomId = "classroom-1"

const actionArgs = (body: unknown) =>
  makeArgs(`http://test/classrooms/${classroomId}/randomize-seating-chart`, {
    method: "POST",
    params: { classroomId },
    body,
  })

const options = {
  keep_existing_tables: false,
  new_table_rows: 2,
  new_table_cols: 2,
  existing_tables: [],
  boundary_width: 1080,
  boundary_height: 820,
}

stubFetch()

describe("randomize-seating-chart action", () => {
  it("posts to the randomize endpoint and returns the generated chart", async () => {
    const chart: SeatingChart = {
      boundary_width: 1080,
      boundary_height: 820,
      tables: [
        {
          table_number: 0,
          rows: 2,
          cols: 2,
          x_pos: 40,
          y_pos: 40,
          seat_assignments: ["s1", null, null, null],
        },
      ],
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: chart }), { status: 200 })
    )

    const result = await action(actionArgs(options))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(
      `http://localhost:3001/api/v1/classrooms/${classroomId}/seating-chart/randomize`
    )
    expect(init?.method).toBe("POST")
    expect(JSON.parse(init?.body as string)).toEqual(options)
    expect(result).toEqual({ ok: true, seatingChart: chart })
  })

  it("returns the backend's message instead of throwing when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Too few tables" }), {
        status: 400,
      })
    )

    const result = await action(actionArgs(options))

    expect(result).toEqual({ ok: false, error: "Too few tables" })
  })
})
