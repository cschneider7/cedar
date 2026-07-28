import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./login"

const validPayload = { email: "test@example.com", password: "password123" }

const args = (body: unknown) =>
  makeArgs("http://test/login", { method: "POST", body })

stubFetch()

describe("login action", () => {
  it("redirects to /classrooms and forwards the session cookie on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { user: { id: "u1", email: validPayload.email } },
        }),
        { status: 200, headers: { "set-cookie": "id=abc; HttpOnly" } }
      )
    )

    try {
      await action(args(validPayload))
      expect.fail("expected a redirect to be thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      const res = response as Response
      expect(res.status).toBe(302)
      expect(res.headers.get("Location")).toBe("/classrooms")
      expect(res.headers.get("Set-Cookie")).toBe("id=abc; HttpOnly")
    }
  })

  it("redirects to a same-origin redirectTo when provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { user: { id: "u1", email: validPayload.email } },
        }),
        { status: 200 }
      )
    )

    try {
      await action(args({ ...validPayload, redirectTo: "/classrooms/abc" }))
      expect.fail("expected a redirect to be thrown")
    } catch (response) {
      expect((response as Response).headers.get("Location")).toBe(
        "/classrooms/abc"
      )
    }
  })

  it("falls back to /classrooms for an unsafe redirectTo (open-redirect guard)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { user: { id: "u1", email: validPayload.email } },
        }),
        { status: 200 }
      )
    )

    try {
      await action(args({ ...validPayload, redirectTo: "//evil.example.com" }))
      expect.fail("expected a redirect to be thrown")
    } catch (response) {
      expect((response as Response).headers.get("Location")).toBe("/classrooms")
    }
  })

  it("returns a generic error for invalid credentials", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid email or password" }), {
        status: 401,
      })
    )

    const result = await action(args(validPayload))

    expect(result).toEqual({
      ok: false,
      error: "Invalid email or password",
      code: undefined,
    })
  })

  it("returns the unverified code for an unverified account", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Please verify your email before logging in",
          code: "unverified",
        }),
        { status: 403 }
      )
    )

    const result = await action(args(validPayload))

    expect(result).toEqual({
      ok: false,
      error: "Please verify your email before logging in",
      code: "unverified",
    })
  })

  it("returns validation errors and never calls fetch for an invalid payload", async () => {
    const result = await action(args({ email: "not-an-email", password: "" }))

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "Please check the form and try again.",
    })
  })
})
