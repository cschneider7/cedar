import { describe, expect, it, vi } from "vitest"
import type { Student } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { loader } from "./quick-search"

const args = (q?: string) =>
  makeArgs(
    `http://test/api/quick-search${q !== undefined ? `?q=${encodeURIComponent(q)}` : ""}`
  )

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 })
}

const students: Student[] = [
  { id: "s1", student_id: 1, name: "Alice", classroom_id: "c1", image_url: null },
]

stubFetch()

describe("quick-search loader", () => {
  it("returns no students and skips the request when q is missing", async () => {
    const result = await loader(args())
    expect(result).toEqual({ students: [] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns no students and skips the request when q is blank", async () => {
    const result = await loader(args("   "))
    expect(result).toEqual({ students: [] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("searches students by the query, capped to a small page", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        students,
        page: 1,
        page_size: 5,
        total_count: 1,
        total_pages: 1,
      })
    )

    const result = await loader(args("ali"))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(
      "http://localhost:3000/api/v1/students?page=1&page_size=5&q=ali"
    )
    expect(result).toEqual({ students })
  })

  it("degrades to no students when the backend call fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }))

    const result = await loader(args("ali"))

    expect(result).toEqual({ students: [] })
  })
})
