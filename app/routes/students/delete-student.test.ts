import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./delete-student"

const studentId = "student-1"

const args = () =>
  makeArgs(`http://test/students/${studentId}/delete`, {
    method: "POST",
    params: { studentId },
  })

stubFetch()

describe("delete-student action", () => {
  it("issues a DELETE request and returns ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(args())

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(`http://localhost:3000/api/v1/students/${studentId}`)
    expect(init?.method).toBe("DELETE")

    expect(result).toEqual({ ok: true, id: studentId })
  })

  it("returns an error result when the delete request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: "Internal Server Error" })
    )

    const result = await action(args())

    expect(result.ok).toBe(false)
  })
})
