import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./edit-classroom"

const classroomId = "classroom-1"

const args = (body: unknown) =>
  makeArgs(`http://test/classrooms/${classroomId}/edit`, {
    method: "POST",
    params: { classroomId },
    body,
  })

stubFetch()

describe("edit-classroom action", () => {
  it("updates the classroom and returns its id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(args({ subject: "Algebra" }))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(`http://localhost:3001/api/v1/classrooms/${classroomId}`)
    expect(init?.method).toBe("PATCH")
    expect(JSON.parse(init?.body as string)).toEqual({ subject: "Algebra" })

    expect(result).toEqual({ ok: true, id: classroomId })
  })

  it("returns validation errors and never calls fetch for an invalid payload", async () => {
    const result = await action(args({ period: -1 }))

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

    const result = await action(args({ subject: "Algebra" }))

    expect(result.ok).toBe(false)
  })
})
