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
  {
    id: "c1",
    period: 1,
    subject: "Math",
    term_season: "fall",
    term_year: 2026,
    boundary_width: 1080,
    boundary_height: 820,
    pinned_at: null,
  },
  {
    id: "c2",
    period: 2,
    subject: "Science",
    term_season: "spring",
    term_year: 2026,
    boundary_width: 1080,
    boundary_height: 820,
    pinned_at: null,
  },
]

const students: Student[] = [
  {
    id: "s1",
    student_id: 1,
    name: "Alice",
    classroom_id: "c1",
    image_url: null,
  },
  { id: "s2", student_id: 2, name: "Bob", classroom_id: "c1", image_url: null },
  {
    id: "s3",
    student_id: 3,
    name: "Carol",
    classroom_id: null,
    image_url: null,
  },
]

stubFetch()

describe("home loader", () => {
  it("skips the API calls and returns empty defaults for an anonymous visitor", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    const result = await loader(loaderArgs())

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      isAuthenticated: false,
      classroomsError: false,
      studentsError: false,
    })
  })

  it("returns no error flags when both calls succeed", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(classrooms))
      .mockResolvedValueOnce(jsonResponse(students))

    const result = await loader(loaderArgs())

    expect(result).toEqual({
      isAuthenticated: true,
      classroomsError: false,
      studentsError: false,
    })
  })

  it("sets an error flag when getClassrooms fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(students))

    const result = await loader(loaderArgs())

    expect(result.classroomsError).toBe(true)
    expect(result.studentsError).toBe(false)
  })

  it("sets an error flag when getStudents fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(classrooms))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))

    const result = await loader(loaderArgs())

    expect(result.classroomsError).toBe(false)
    expect(result.studentsError).toBe(true)
  })
})
