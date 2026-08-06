import { getAuth } from "@clerk/react-router/server"
import { describe, expect, it, vi } from "vitest"
import { makeArgs } from "~/lib/test-utils"
import { loader } from "./signup"

describe("signup loader", () => {
  it("returns undefined when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    const data = await loader(makeArgs("http://test/signup"))
    expect(data).toBeUndefined()
  })

  it("throws a redirect to / when already authenticated", async () => {
    // getAuth defaults to authenticated per clerk-test-setup.ts's setupFile
    try {
      await loader(makeArgs("http://test/signup"))
      expect.fail("expected a redirect to be thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      const res = response as Response
      expect(res.status).toBe(302)
      expect(res.headers.get("Location")).toBe("/")
    }
  })
})
