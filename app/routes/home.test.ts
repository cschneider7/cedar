import { getAuth } from "@clerk/react-router/server"
import { describe, expect, it, vi } from "vitest"
import type { Classroom, Student } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { loader } from "./home"

const loaderArgs = () => makeArgs("http://test/")

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 })
}

const classrooms: Classroom[] = [
  { id: "c1", period: 1, subject: "Math", boundary_width: 1080, boundary_height: 820 },
  { id: "c2", period: 2, subject: "Science", boundary_width: 1080, boundary_height: 820 },
]

const students: Student[] = [
  { id: "s1", student_id: 1, name: "Alice", classroom_id: "c1", image_url: null },
  { id: "s2", student_id: 2, name: "Bob", classroom_id: "c1", image_url: null },
  { id: "s3", student_id: 3, name: "Carol", classroom_id: null, image_url: null },
]

stubFetch()

describe("home loader", () => {
  it("skips the API calls and returns zeros for an anonymous visitor", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    const result = await loader(loaderArgs())

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      isAuthenticated: false,
      classrooms: [],
      classroomsError: false,
      studentCount: 0,
      studentsError: false,
    })
  })

  it("returns classrooms and a student count when both calls succeed", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(classrooms))
      .mockResolvedValueOnce(jsonResponse(students))

    const result = await loader(loaderArgs())

    expect(result).toEqual({
      isAuthenticated: true,
      classrooms,
      classroomsError: false,
      studentCount: 3,
      studentsError: false,
    })
  })

  it("degrades to an empty classroom list and an error flag when getClassrooms fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(students))

    const result = await loader(loaderArgs())

    expect(result.classrooms).toEqual([])
    expect(result.classroomsError).toBe(true)
    expect(result.studentCount).toBe(3)
    expect(result.studentsError).toBe(false)
  })

  it("degrades to a zero student count and an error flag when getStudents fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(classrooms))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))

    const result = await loader(loaderArgs())

    expect(result.classrooms).toEqual(classrooms)
    expect(result.classroomsError).toBe(false)
    expect(result.studentCount).toBe(0)
    expect(result.studentsError).toBe(true)
  })
})
