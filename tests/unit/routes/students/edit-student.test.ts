import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~test/support/test-utils"
import { action } from "~/routes/students/edit-student"

const studentId = "student-1"

const args = (body: unknown) =>
  makeArgs(`http://test/students/${studentId}/edit`, {
    method: "POST",
    params: { studentId },
    body,
  })

stubFetch()

describe("edit-student action", () => {
  it("updates the student and returns its id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(args({ name: "Bob Updated" }))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [patchUrl, patchInit] = vi.mocked(fetch).mock.calls[0]
    expect(patchUrl).toBe(`http://localhost:3001/api/v1/students/${studentId}`)
    expect(patchInit?.method).toBe("PATCH")
    expect(JSON.parse(patchInit?.body as string)).toEqual({
      name: "Bob Updated",
    })

    expect(result).toEqual({ ok: true, id: studentId })
  })

  it("clears seating_preference by sending an explicit null", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(args({ seating_preference: null }))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [patchUrl, patchInit] = vi.mocked(fetch).mock.calls[0]
    expect(patchUrl).toBe(`http://localhost:3001/api/v1/students/${studentId}`)
    expect(patchInit?.method).toBe("PATCH")
    expect(JSON.parse(patchInit?.body as string)).toEqual({
      seating_preference: null,
    })

    expect(result).toEqual({ ok: true, id: studentId })
  })

  it("returns validation errors and never calls fetch for an invalid payload", async () => {
    const result = await action(args({ student_id: -1 }))

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "Please check the form and try again.",
    })
  })

  it("returns an error result when the backend rejects the update request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: "Internal Server Error" })
    )

    const result = await action(args({ name: "Bob Updated" }))

    expect(result.ok).toBe(false)
  })
})
