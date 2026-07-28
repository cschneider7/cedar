import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action, loader } from "./reset-password"

const validPayload = {
  token: "reset-token",
  password: "newpassword123",
  confirmPassword: "newpassword123",
}

const args = (body: unknown) =>
  makeArgs("http://test/reset-password", { method: "POST", body })

stubFetch()

describe("reset-password loader", () => {
  it("passes the token through without validating it", async () => {
    const result = await loader(
      makeArgs("http://test/reset-password?token=abc123")
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({ token: "abc123" })
  })

  it("defaults to an empty token when none is present", async () => {
    const result = await loader(makeArgs("http://test/reset-password"))

    expect(result).toEqual({ token: "" })
  })
})

describe("reset-password action", () => {
  it("returns ok on a successful reset", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(args(validPayload))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(init?.body as string)).toEqual({
      token: validPayload.token,
      password: validPayload.password,
    })
    expect(result).toEqual({ ok: true })
  })

  it("returns an error for an expired/invalid token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "This reset link is invalid or has expired",
        }),
        { status: 400 }
      )
    )

    const result = await action(args(validPayload))

    expect(result).toEqual({
      ok: false,
      error: "This reset link is invalid or has expired",
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
})
