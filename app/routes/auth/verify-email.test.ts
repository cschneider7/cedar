import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { loader } from "./verify-email"

stubFetch()

describe("verify-email loader", () => {
  it("returns ok for a valid token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await loader(
      makeArgs("http://test/verify-email?token=abc123")
    )

    expect(result).toEqual({ ok: true })
  })

  it("returns an error for an expired/invalid token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "This verification link is invalid or has expired",
        }),
        { status: 400 }
      )
    )

    const result = await loader(makeArgs("http://test/verify-email?token=bad"))

    expect(result).toEqual({
      ok: false,
      error: "This verification link is invalid or has expired",
    })
  })

  it("returns an error and never calls fetch when no token is present", async () => {
    const result = await loader(makeArgs("http://test/verify-email"))

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "This verification link is invalid or has expired",
    })
  })
})
