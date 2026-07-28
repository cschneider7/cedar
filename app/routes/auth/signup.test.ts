import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./signup"

const validPayload = {
  email: "test@example.com",
  password: "password123",
  confirmPassword: "password123",
}

const args = (body: unknown) =>
  makeArgs("http://test/signup", { method: "POST", body })

stubFetch()

describe("signup action", () => {
  it("shows the confirmation state (no redirect) on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { user: { id: "u1", email: validPayload.email } },
        }),
        { status: 201 }
      )
    )

    const result = await action(args(validPayload))

    expect(result).toEqual({ ok: true, email: validPayload.email })
  })

  it("returns an error for a duplicate email", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "An account with this email already exists",
        }),
        { status: 409 }
      )
    )

    const result = await action(args(validPayload))

    expect(result).toEqual({
      ok: false,
      error: "An account with this email already exists",
    })
  })

  it("returns validation errors and never calls fetch on a password mismatch", async () => {
    const result = await action(
      args({ ...validPayload, confirmPassword: "different" })
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "Please check the form and try again.",
    })
  })

  it("returns validation errors and never calls fetch for a weak password", async () => {
    const result = await action(
      args({ ...validPayload, password: "short", confirmPassword: "short" })
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "Please check the form and try again.",
    })
  })

  it("resends the verification email without re-validating the signup fields", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(
      args({ intent: "resend", email: validPayload.email })
    )

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://localhost:3000/api/v1/auth/resend-verification")
    expect(result).toEqual({ ok: true, email: validPayload.email })
  })
})
