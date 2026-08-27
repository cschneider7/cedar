import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./bulk-unassign-students"

const args = (ids: string[]) =>
  makeArgs("http://test/students/bulk-unassign", {
    method: "POST",
    body: { ids },
  })

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status })
}

stubFetch()

describe("bulk-unassign-students action", () => {
  it("patches each selected student's classroom_id to null", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}))

    const result = await action(args(["s1", "s2"]))

    expect(fetch).toHaveBeenCalledTimes(2)
    const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => url)
    expect(calledUrls).toContain("http://localhost:3001/api/v1/students/s1")
    expect(calledUrls).toContain("http://localhost:3001/api/v1/students/s2")
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init?.method).toBe("PATCH")
      expect(JSON.parse(init?.body as string)).toEqual({ classroom_id: null })
    }
    expect(result).toEqual({ ok: true })
  })

  it("returns the backend's error message on failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Not authorized" }), {
        status: 403,
      })
    )

    const result = await action(args(["s1"]))

    expect(result).toEqual({ ok: false, error: "Not authorized" })
  })

  it("rejects an empty selection", async () => {
    const result = await action(args([]))

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "Please check your selection and try again.",
    })
  })
})
