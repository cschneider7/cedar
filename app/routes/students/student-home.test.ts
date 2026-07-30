import { describe, expect, it, vi } from "vitest"
import type { Classroom, StudentsPage } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { loader } from "./student-home"

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 })
}

stubFetch()

const emptyPage: StudentsPage = {
  students: [],
  page: 1,
  page_size: 24,
  total_count: 0,
  total_pages: 1,
}
const noClassrooms: Classroom[] = []

describe("student-home loader", () => {
  it("defaults to page 1, no q, grid page_size (24) with no search params", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "u1", email: "a@b.com" } })
      )
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students"))

    const [url] = vi.mocked(fetch).mock.calls[1]
    const params = new URL(String(url)).searchParams
    expect(params.get("page")).toBe("1")
    expect(params.get("page_size")).toBe("24")
    expect(params.has("q")).toBe(false)
  })

  it("passes page and q through from URL search params", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "u1", email: "a@b.com" } })
      )
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?page=2&q=ana"))

    const [url] = vi.mocked(fetch).mock.calls[1]
    const params = new URL(String(url)).searchParams
    expect(params.get("page")).toBe("2")
    expect(params.get("q")).toBe("ana")
  })

  it("uses list page_size (20) when view=list", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "u1", email: "a@b.com" } })
      )
      .mockResolvedValueOnce(jsonResponse({ ...emptyPage, page_size: 20 }))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?view=list"))

    const [url] = vi.mocked(fetch).mock.calls[1]
    expect(new URL(String(url)).searchParams.get("page_size")).toBe("20")
  })

  it("clamps a non-numeric or negative page to 1", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "u1", email: "a@b.com" } })
      )
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?page=-5"))

    const [url] = vi.mocked(fetch).mock.calls[1]
    expect(new URL(String(url)).searchParams.get("page")).toBe("1")
  })

  it("defaults sort_by to name and sort_dir to asc with no sort params", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "u1", email: "a@b.com" } })
      )
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students"))

    const [url] = vi.mocked(fetch).mock.calls[1]
    const params = new URL(String(url)).searchParams
    expect(params.get("sort_by")).toBe("name")
    expect(params.get("sort_dir")).toBe("asc")
  })

  it("passes sort_by/sort_dir through from URL search params", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "u1", email: "a@b.com" } })
      )
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(
      makeArgs("http://test/students?sort_by=classroom&sort_dir=desc")
    )

    const [url] = vi.mocked(fetch).mock.calls[1]
    const params = new URL(String(url)).searchParams
    expect(params.get("sort_by")).toBe("classroom")
    expect(params.get("sort_dir")).toBe("desc")
  })

  it("falls back to name for an unrecognized sort_by value", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "u1", email: "a@b.com" } })
      )
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?sort_by=bogus"))

    const [url] = vi.mocked(fetch).mock.calls[1]
    expect(new URL(String(url)).searchParams.get("sort_by")).toBe("name")
  })

  it("returns the students page, page, q, viewMode, and classrooms", async () => {
    const page: StudentsPage = {
      students: [
        { id: "s1", student_id: 1, name: "Alice", classroom_id: null },
      ],
      page: 1,
      page_size: 24,
      total_count: 1,
      total_pages: 1,
    }
    const classrooms: Classroom[] = [
      {
        id: "c1",
        period: 2,
        subject: "Math",
        boundary_width: 1080,
        boundary_height: 820,
      },
    ]
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "u1", email: "a@b.com" } })
      )
      .mockResolvedValueOnce(jsonResponse(page))
      .mockResolvedValueOnce(jsonResponse(classrooms))

    const result = await loader(makeArgs("http://test/students"))

    expect(result.studentsPage).toEqual(page)
    expect(result.page).toBe(1)
    expect(result.q).toBe("")
    expect(result.viewMode).toBe("grid")
    expect(result.classrooms).toEqual(classrooms)
    expect(result.sortBy).toBe("name")
    expect(result.sortDir).toBe("asc")
  })
})
