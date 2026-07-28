import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./forgot-password"

const args = (body: unknown) =>
  makeArgs("http://test/forgot-password", { method: "POST", body })

stubFetch()

describe("forgot-password action", () => {
  it("returns ok for a known email", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(args({ email: "test@example.com" }))

    expect(result).toEqual({ ok: true })
  })

  it("returns the same ok result for an unknown email (no leak)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await action(args({ email: "nobody@example.com" }))

    expect(result).toEqual({ ok: true })
  })

  it("returns validation errors and never calls fetch for an invalid email", async () => {
    const result = await action(args({ email: "not-an-email" }))

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "Please check the form and try again.",
    })
  })
})
