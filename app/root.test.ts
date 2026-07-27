import { describe, expect, it, vi } from "vitest"
import type { Classroom } from "~/lib/schemas"
import { stubFetch } from "~/lib/test-utils"
import { loader } from "./root"

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 })
}

stubFetch()

describe("root loader", () => {
  it("returns the classroom list from getClassrooms", async () => {
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

    const result = await loader()

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://localhost:3000/api/v1/classrooms")
    expect(result).toEqual({ classrooms })
  })
})
