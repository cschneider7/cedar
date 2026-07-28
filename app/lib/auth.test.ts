import { describe, expect, it, vi } from "vitest"
import { cookieFromRequest, requireUser } from "~/lib/auth"
import { stubFetch } from "~/lib/test-utils"

stubFetch()

describe("cookieFromRequest", () => {
  it("returns the request's Cookie header", () => {
    const request = new Request("http://test/", {
      headers: { cookie: "id=abc" },
    })
    expect(cookieFromRequest(request)).toBe("id=abc")
  })

  it("returns undefined when there's no Cookie header", () => {
    const request = new Request("http://test/")
    expect(cookieFromRequest(request)).toBeUndefined()
  })
})

describe("requireUser", () => {
  it("returns the user when the session is valid", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { user: { id: "u1", email: "a@b.com" } } }),
        { status: 200 }
      )
    )

    const user = await requireUser(
      new Request("http://test/classrooms", { headers: { cookie: "id=abc" } })
    )

    expect(user).toEqual({ id: "u1", email: "a@b.com" })
  })

  it("throws a redirect to /login with redirectTo when unauthenticated", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }))

    try {
      await requireUser(new Request("http://test/classrooms/abc123"))
      expect.fail("expected a redirect to be thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      const res = response as Response
      expect(res.status).toBe(302)
      expect(res.headers.get("Location")).toBe(
        "/login?redirectTo=%2Fclassrooms%2Fabc123"
      )
    }
  })
})
