import { describe, expect, it, vi } from "vitest"
import type { ColdCall, ColdCallPick } from "~/lib/schemas"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./cold-call"

const classroomId = "classroom-1"

const actionArgs = (body: unknown) =>
  makeArgs(`http://test/classrooms/${classroomId}/cold-call`, {
    method: "POST",
    params: { classroomId },
    body,
  })

const payload: ColdCall = {
  students: [
    { student_id: "s1", weight: 100 },
    { student_id: "s2", weight: 50 },
  ],
}

stubFetch()

describe("cold-call action", () => {
  it("posts to the cold-call endpoint and returns the pick", async () => {
    const pick: ColdCallPick = {
      picked_student_id: "s1",
      students: [
        { student_id: "s1", weight: 80 },
        { student_id: "s2", weight: 55 },
      ],
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: pick }), { status: 200 })
    )

    const result = await action(actionArgs(payload))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(
      `http://localhost:3001/api/v1/classrooms/${classroomId}/cold-call`
    )
    expect(init?.method).toBe("POST")
    expect(JSON.parse(init?.body as string)).toEqual(payload)
    expect(result).toEqual({ ok: true, pick })
  })

  it("returns the backend's message instead of throwing when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "The student list must not be empty" }),
        {
          status: 400,
        }
      )
    )

    const result = await action(actionArgs({ students: [] }))

    expect(result).toEqual({
      ok: false,
      error: "The student list must not be empty",
    })
  })
})
