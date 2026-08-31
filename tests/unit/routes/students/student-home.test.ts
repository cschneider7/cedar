import { describe, expect, it, vi } from "vitest"
import type { Classroom, StudentsPage } from "~/lib/schemas"
import { expectLoaderData, makeArgs, stubFetch } from "~test/support/test-utils"
import { loader } from "~/routes/students/student-home"

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
  it("defaults to page 1, no q, list page_size (20) with no search params", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ ...emptyPage, page_size: 20 }))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students"))

    const [url] = vi.mocked(fetch).mock.calls[0]
    const params = new URL(String(url)).searchParams
    expect(params.get("page")).toBe("1")
    expect(params.get("page_size")).toBe("20")
    expect(params.has("q")).toBe(false)
  })

  it("uses grid page_size (24) when view=grid", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?view=grid"))

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(new URL(String(url)).searchParams.get("page_size")).toBe("24")
  })

  it("sets the view-mode cookie only when a ?view= param is present", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))
    const withParam = (await loader(
      makeArgs("http://test/students?view=grid")
    )) as { init?: { headers?: Record<string, string> } }
    expect(withParam.init?.headers?.["Set-Cookie"]).toContain(
      "students-view-mode=grid"
    )

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ ...emptyPage, page_size: 20 }))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))
    const noParam = (await loader(makeArgs("http://test/students"))) as {
      init?: { headers?: Record<string, string> } | null
    }
    expect(noParam.init?.headers?.["Set-Cookie"]).toBeUndefined()
  })

  it("passes page and q through from URL search params", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?page=2&q=ana"))

    const [url] = vi.mocked(fetch).mock.calls[0]
    const params = new URL(String(url)).searchParams
    expect(params.get("page")).toBe("2")
    expect(params.get("q")).toBe("ana")
  })

  it("uses list page_size (20) when view=list", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ ...emptyPage, page_size: 20 }))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?view=list"))

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(new URL(String(url)).searchParams.get("page_size")).toBe("20")
  })

  it("falls back to the students-view-mode cookie when no ?view= param is present", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ ...emptyPage, page_size: 20 }))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    const result = expectLoaderData(
      await loader(
        makeArgs("http://test/students", {
          headers: { Cookie: "students-view-mode=list" },
        })
      )
    )

    expect(result.viewMode).toBe("list")
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(new URL(String(url)).searchParams.get("page_size")).toBe("20")
  })

  it("an explicit ?view= param overrides the cookie", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    const result = expectLoaderData(
      await loader(
        makeArgs("http://test/students?view=grid", {
          headers: { Cookie: "students-view-mode=list" },
        })
      )
    )

    expect(result.viewMode).toBe("grid")
  })

  it("clamps a non-numeric or negative page to 1", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?page=-5"))

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(new URL(String(url)).searchParams.get("page")).toBe("1")
  })

  it("defaults sort_by to name and sort_dir to asc with no sort params", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students"))

    const [url] = vi.mocked(fetch).mock.calls[0]
    const params = new URL(String(url)).searchParams
    expect(params.get("sort_by")).toBe("name")
    expect(params.get("sort_dir")).toBe("asc")
  })

  it("passes sort_by/sort_dir through from URL search params", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(
      makeArgs("http://test/students?sort_by=classroom&sort_dir=desc")
    )

    const [url] = vi.mocked(fetch).mock.calls[0]
    const params = new URL(String(url)).searchParams
    expect(params.get("sort_by")).toBe("classroom")
    expect(params.get("sort_dir")).toBe("desc")
  })

  it("falls back to name for an unrecognized sort_by value", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(emptyPage))
      .mockResolvedValueOnce(jsonResponse(noClassrooms))

    await loader(makeArgs("http://test/students?sort_by=bogus"))

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(new URL(String(url)).searchParams.get("sort_by")).toBe("name")
  })

  it("returns the students page, page, q, viewMode, and classrooms", async () => {
    const page: StudentsPage = {
      students: [
        {
          id: "s1",
          student_id: 1,
          name: "Alice",
          classroom_id: null,
          image_url: null,
        },
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
        term_season: "fall",
        term_year: 2026,
        boundary_width: 1080,
        boundary_height: 820,
        pinned_at: null,
      },
    ]
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(page))
      .mockResolvedValueOnce(jsonResponse(classrooms))

    const result = expectLoaderData(
      await loader(makeArgs("http://test/students"))
    )

    expect(result.studentsPage).toEqual(page)
    expect(result.page).toBe(1)
    expect(result.q).toBe("")
    expect(result.viewMode).toBe("list")
    expect(result.classrooms).toEqual(classrooms)
    expect(result.sortBy).toBe("name")
    expect(result.sortDir).toBe("asc")
  })
})
