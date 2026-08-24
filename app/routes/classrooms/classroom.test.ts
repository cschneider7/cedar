import { describe, expect, it, vi } from "vitest"
import type {
  Classroom,
  SeatingChart,
  Separation,
  Student,
} from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { clientLoader as loader } from "./classroom"

const classroomId = "classroom-1"

const loaderArgs = () =>
  makeArgs(`http://test/classrooms/${classroomId}`, {
    params: { classroomId },
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
      term_season: "fall",
      term_year: 2026,
      boundary_width: 1080,
      boundary_height: 820,
      pinned_at: null,
    }
    const seatingChart: SeatingChart = {
      boundary_width: 1080,
      boundary_height: 820,
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
        image_url: null,
      },
      {
        id: "s2",
        student_id: 2,
        name: "In another classroom",
        classroom_id: "other-classroom",
        image_url: null,
      },
      {
        id: "s3",
        student_id: 3,
        name: "Unassigned to any classroom",
        classroom_id: null,
        image_url: null,
      },
      {
        id: "s4",
        student_id: 4,
        name: "Also in this classroom",
        classroom_id: classroomId,
        image_url: null,
      },
    ]
    const separations: Separation[] = [
      { id: "sep1", student_id_a: "s1", student_id_b: "s2" },
      { id: "sep2", student_id_a: "s2", student_id_b: "s3" },
      { id: "sep3", student_id_a: "s1", student_id_b: "s4" },
    ]

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(classroom))
      .mockResolvedValueOnce(jsonResponse(seatingChart))
      .mockResolvedValueOnce(jsonResponse(students))
      .mockResolvedValueOnce(jsonResponse(separations))

    const result = await loader(loaderArgs())

    expect(fetch).toHaveBeenCalledTimes(4)
    const [classroomUrl] = vi.mocked(fetch).mock.calls[0]
    const [seatingChartUrl] = vi.mocked(fetch).mock.calls[1]
    const [studentsUrl] = vi.mocked(fetch).mock.calls[2]
    const [separationsUrl] = vi.mocked(fetch).mock.calls[3]
    expect(classroomUrl).toBe(
      `http://localhost:3000/api/v1/classrooms/${classroomId}`
    )
    expect(seatingChartUrl).toBe(
      `http://localhost:3000/api/v1/classrooms/${classroomId}/seating-chart`
    )
    expect(studentsUrl).toBe("http://localhost:3000/api/v1/students")
    expect(separationsUrl).toBe("http://localhost:3000/api/v1/separations")

    expect(result.classroom).toEqual(classroom)
    expect(result.seatingChart).toEqual(seatingChart)
    expect(result.students).toEqual([students[0], students[3]])
    // Only the pair where both students are in this classroom survives.
    expect(result.separations).toEqual([separations[2]])
  })
})
