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
  it("returns the user's classrooms when authenticated", async () => {
    const classrooms: Classroom[] = [
      {
        id: "classroom-1",
        period: 2,
        subject: "Math",
        boundary_width: 1080,
        boundary_height: 820,
      },
    ]
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(classrooms))

    const result = await loader(makeArgs("http://localhost/"))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [classroomsUrl] = vi.mocked(fetch).mock.calls[0]
    expect(classroomsUrl).toBe("http://localhost:3000/api/v1/classrooms")
    expect(result).toEqual({ classrooms })
  })

  it("returns no classrooms when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    const result = await loader(makeArgs("http://localhost/"))

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({ classrooms: [] })
  })
})
