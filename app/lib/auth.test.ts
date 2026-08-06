import { getAuth } from "@clerk/react-router/server"
import { describe, expect, it, vi } from "vitest"
import { requireToken, tokenFromRequest } from "~/lib/auth"
import { makeArgs } from "~/lib/test-utils"

describe("requireToken", () => {
  it("returns the token when the session is valid", async () => {
    const token = await requireToken(makeArgs("http://test/classrooms"))
    expect(token).toBe("test-token")
  })

  it("throws a redirect to /login when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    try {
      await requireToken(makeArgs("http://test/classrooms/abc123"))
      expect.fail("expected a redirect to be thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      const res = response as Response
      expect(res.status).toBe(302)
      expect(res.headers.get("Location")).toBe("/login")
    }
  })
})

describe("tokenFromRequest", () => {
  it("returns the token when the session is valid", async () => {
    const token = await tokenFromRequest(makeArgs("http://test/classrooms"))
    expect(token).toBe("test-token")
  })

  it("returns undefined instead of throwing when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    const token = await tokenFromRequest(makeArgs("http://test/classrooms"))
    expect(token).toBeUndefined()
  })
})
