import { getAuth } from "@clerk/react-router/server"
import { describe, expect, it, vi } from "vitest"
import { makeArgs } from "~/lib/test-utils"
import { loader } from "./signup"

function unauthenticated() {
  vi.mocked(getAuth).mockResolvedValueOnce({
    isAuthenticated: false,
    getToken: async () => null,
  } as Awaited<ReturnType<typeof getAuth>>)
}

describe("signup loader", () => {
  it("returns redirectTo: / when unauthenticated with no redirectTo param", async () => {
    unauthenticated()
    const data = await loader(makeArgs("http://test/signup"))
    expect(data).toEqual({ redirectTo: "/" })
  })

  it("returns a same-app redirectTo as-is", async () => {
    unauthenticated()
    const data = await loader(
      makeArgs("http://test/signup?redirectTo=%2Fclassrooms%2Fabc")
    )
    expect(data).toEqual({ redirectTo: "/classrooms/abc" })
  })

  it("sanitizes an absolute URL redirectTo to /", async () => {
    unauthenticated()
    const data = await loader(
      makeArgs(
        `http://test/signup?redirectTo=${encodeURIComponent("https://evil.com")}`
      )
    )
    expect(data).toEqual({ redirectTo: "/" })
  })

  it("sanitizes a protocol-relative redirectTo to /", async () => {
    unauthenticated()
    const data = await loader(
      makeArgs(
        `http://test/signup?redirectTo=${encodeURIComponent("//evil.com")}`
      )
    )
    expect(data).toEqual({ redirectTo: "/" })
  })

  it("throws a redirect to the sanitized target when already authenticated", async () => {
    try {
      await loader(
        makeArgs("http://test/signup?redirectTo=%2Fclassrooms%2Fabc")
      )
      expect.fail("expected a redirect to be thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      const res = response as Response
      expect(res.status).toBe(302)
      expect(res.headers.get("Location")).toBe("/classrooms/abc")
    }
  })
})
