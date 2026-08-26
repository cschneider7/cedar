import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { clientAction as action } from "./create-student"

const validPayload = {
  student_id: 123,
  name: "Bob Burger",
  classroom_id: null,
  image_url: null,
  seating_preference: "front",
}

const args = (body: unknown) =>
  makeArgs("http://test/students/new", { method: "POST", body })

stubFetch()

describe("create-student action", () => {
  it("creates the student and returns its id", async () => {
    const createdStudent = { id: "student-1", ...validPayload }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: createdStudent }), { status: 201 })
    )

    const result = await action(args(validPayload))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://localhost:3000/api/v1/students")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(init?.body as string)).toEqual(validPayload)

    expect(result).toEqual({ ok: true, id: createdStudent.id })
  })

  // StudentPhotoField's value isn't a react-hook-form-registered field, so
  // the dialog's real submit payload never includes `image_url` at all when
  // no photo is staged/removed — CreateStudentSchema must tolerate that (a
  // required-but-nullable `image_url` broke this silently: zodResolver
  // rejected before onSubmit ever ran, with no visible error).
  it("creates the student when image_url is omitted entirely", async () => {
    const { image_url: _imageUrl, ...payloadWithoutImageUrl } = validPayload
    const createdStudent = { id: "student-1", ...payloadWithoutImageUrl }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: createdStudent }), { status: 201 })
    )

    const result = await action(args(payloadWithoutImageUrl))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, id: createdStudent.id })
  })

  // seating_preference is `.nullable().optional()` on CreateStudentSchema,
  // so the request must still succeed when it's left out entirely.
  it("creates the student when seating_preference is omitted entirely", async () => {
    const {
      seating_preference: _seatingPreference,
      ...payloadWithoutSeatingPreference
    } = validPayload
    const createdStudent = {
      id: "student-1",
      ...payloadWithoutSeatingPreference,
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: createdStudent }), { status: 201 })
    )

    const result = await action(args(payloadWithoutSeatingPreference))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, id: createdStudent.id })
  })

  it("returns validation errors and never calls fetch for an invalid payload", async () => {
    const result = await action(
      args({
        student_id: -1,
        name: "",
        classroom_id: null,
      })
    )

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
