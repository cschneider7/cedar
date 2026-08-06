import { getAuth } from "@clerk/react-router/server"
import { describe, expect, it, vi } from "vitest"
import { requireAuth, tokenFromRequest } from "~/lib/auth"
import { makeArgs } from "~/lib/test-utils"

describe("requireAuth", () => {
  it("calls next() and returns its result when the session is valid", async () => {
    const next = vi.fn(async () => new Response("ok"))
    const result = await requireAuth(makeArgs("http://test/classrooms"), next)
    expect(next).toHaveBeenCalledOnce()
    expect(result).toBeInstanceOf(Response)
  })

  it("throws a redirect to /login without calling next() when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)
    const next = vi.fn(async () => new Response("ok"))

    try {
      await requireAuth(makeArgs("http://test/classrooms/abc123"), next)
      expect.fail("expected a redirect to be thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      const res = response as Response
      expect(res.status).toBe(302)
      expect(res.headers.get("Location")).toBe("/login")
    }
    expect(next).not.toHaveBeenCalled()
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
