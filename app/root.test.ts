import { getAuth } from "@clerk/react-router/server"
import { describe, expect, it, vi } from "vitest"
import type { Classroom } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { loader } from "./root"

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 })
}

stubFetch()

describe("root loader", () => {
  it("returns the user's classrooms and student limit status when authenticated", async () => {
    const classrooms: Classroom[] = [
      {
        id: "classroom-1",
        period: 2,
        subject: "Math",
        term_season: "fall",
        term_year: 2026,
        boundary_width: 1080,
        boundary_height: 820,
        pinned_at: null,
      },
    ]
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(classrooms))
      .mockResolvedValueOnce(jsonResponse({ count: 12, limit: 850 }))

    const result = await loader(makeArgs("http://localhost/"))

    expect(fetch).toHaveBeenCalledTimes(2)
    const [classroomsUrl] = vi.mocked(fetch).mock.calls[0]
    expect(classroomsUrl).toBe("http://localhost:3000/api/v1/classrooms")
    const [limitUrl] = vi.mocked(fetch).mock.calls[1]
    expect(limitUrl).toBe("http://localhost:3000/api/v1/students/count")
    expect(result).toEqual({
      classrooms,
      classroomsError: false,
      studentCount: 12,
      studentLimit: 850,
    })
  })

  it("returns no classrooms or student limit status when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    const result = await loader(makeArgs("http://localhost/"))

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      classrooms: [],
      classroomsError: false,
      studentCount: null,
      studentLimit: null,
    })
  })

  it("degrades to empty/null instead of throwing when either fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    )

    const result = await loader(makeArgs("http://localhost/"))

    expect(result).toEqual({
      classrooms: [],
      classroomsError: true,
      studentCount: null,
      studentLimit: null,
    })
  })
})
