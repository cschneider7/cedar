import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./create-classroom"

const validPayload = {
  subject: "Math 2",
  period: 3,
  term_season: "fall",
  term_year: 2026,
}

const args = (body: unknown) =>
  makeArgs("http://test/classrooms/new", { method: "POST", body })

stubFetch()

describe("create-classroom action", () => {
  it("creates the classroom and returns its id", async () => {
    const createdClassroom = {
      id: "classroom-1",
      ...validPayload,
      boundary_width: 1080,
      boundary_height: 820,
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: createdClassroom }), {
        status: 200,
      })
    )

    const result = await action(args(validPayload))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://localhost:3000/api/v1/classrooms")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(init?.body as string)).toEqual(validPayload)

    expect(result).toEqual({ ok: true, id: createdClassroom.id })
  })

  it("returns validation errors and never calls fetch for an invalid payload", async () => {
    const result = await action(args({ subject: "", period: -1 }))

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "Please check the form and try again.",
    })
  })

  it("returns an error result when the backend rejects the create request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: "Internal Server Error" })
    )

    const result = await action(args(validPayload))

    expect(result.ok).toBe(false)
  })
})
