import { describe, expect, it, vi } from "vitest"
import type { Classroom, SeatingChart, Student } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action, loader } from "./classroom"

const classroomId = "classroom-1"

const loaderArgs = () =>
  makeArgs(`http://test/classrooms/${classroomId}`, {
    params: { classroomId },
  })

const actionArgs = (body: unknown) =>
  makeArgs(`http://test/classrooms/${classroomId}`, {
    method: "POST",
    params: { classroomId },
    body,
  })

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 })
}

stubFetch()

describe("classroom loader", () => {
  it("loads the classroom, its seating chart, and its students in this classroom", async () => {
    const classroom: Classroom = {
      id: classroomId,
      period: 2,
      subject: "Math",
      boundary_width: 1080,
      boundary_height: 820,
    }
    const seatingChart: SeatingChart = {
      tables: [
        {
          table_number: 1,
          rows: 2,
          cols: 2,
          x_pos: 0,
          y_pos: 0,
          seat_assignments: [null, null, null, null],
        },
      ],
    }
    const students: Student[] = [
      {
        id: "s1",
        student_id: 1,
        name: "In this classroom",
        classroom_id: classroomId,
      },
      {
        id: "s2",
        student_id: 2,
        name: "In another classroom",
        classroom_id: "other-classroom",
      },
      {
        id: "s3",
        student_id: 3,
        name: "Unassigned to any classroom",
        classroom_id: null,
      },
    ]

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(classroom))
      .mockResolvedValueOnce(jsonResponse(seatingChart))
      .mockResolvedValueOnce(jsonResponse(students))

    const result = await loader(loaderArgs())

    expect(fetch).toHaveBeenCalledTimes(3)
    const [classroomUrl] = vi.mocked(fetch).mock.calls[0]
    const [seatingChartUrl] = vi.mocked(fetch).mock.calls[1]
    const [studentsUrl] = vi.mocked(fetch).mock.calls[2]
    expect(classroomUrl).toBe(
      `http://localhost:3000/api/v1/classrooms/${classroomId}`
    )
    expect(seatingChartUrl).toBe(
      `http://localhost:3000/api/v1/classrooms/${classroomId}/seating-chart`
    )
    expect(studentsUrl).toBe("http://localhost:3000/api/v1/students")

    expect(result.classroom).toEqual(classroom)
    expect(result.seatingChart).toEqual(seatingChart)
    expect(result.students).toEqual([students[0]])
  })
})

describe("classroom action", () => {
  const chart: SeatingChart = {
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
