import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./bulk-delete-students"

const args = (ids: string[]) =>
  makeArgs("http://test/students/bulk-delete", {
    method: "POST",
    body: { ids },
  })

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status })
}

stubFetch()

describe("bulk-delete-students action", () => {
  it("posts the ids to the bulk-delete endpoint and returns ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ deleted_count: 2 }))

    const result = await action(args(["s1", "s2"]))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://localhost:3000/api/v1/students")
    expect(init?.method).toBe("DELETE")
    expect(JSON.parse(init?.body as string)).toEqual({ ids: ["s1", "s2"] })
    expect(result).toEqual({ ok: true })
  })

  it("returns the backend's error message on failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not authorized" }), {
        status: 403,
      })
    )

    const result = await action(args(["s1"]))

    expect(result).toEqual({ ok: false, error: "Not authorized" })
  })
})
