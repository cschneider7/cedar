import { describe, expect, it, vi } from "vitest"
import type { Classroom, User } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { loader } from "./root"

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 })
}

stubFetch()

describe("root loader", () => {
  it("returns the user and their classrooms when authenticated", async () => {
    const user: User = { id: "user-1", email: "test@example.com" }
    const classrooms: Classroom[] = [
      {
        id: "classroom-1",
        period: 2,
        subject: "Math",
        boundary_width: 1080,
        boundary_height: 820,
      },
    ]
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ user }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(classrooms))

    const result = await loader(makeArgs("http://localhost/"))

    expect(fetch).toHaveBeenCalledTimes(2)
    const [meUrl] = vi.mocked(fetch).mock.calls[0]
    expect(meUrl).toBe("http://localhost:3000/api/v1/auth/me")
    const [classroomsUrl] = vi.mocked(fetch).mock.calls[1]
    expect(classroomsUrl).toBe("http://localhost:3000/api/v1/classrooms")
    expect(result).toEqual({ user, classrooms })
  })

  it("returns no classrooms when unauthenticated", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Not authenticated", { status: 401 })
    )

    const result = await loader(makeArgs("http://localhost/"))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ user: null, classrooms: [] })
  })
})
