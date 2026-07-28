import { describe, expect, it, vi } from "vitest"
import { makeArgs, stubFetch } from "~/lib/test-utils"
import { action } from "./logout"

stubFetch()

describe("logout action", () => {
  it("calls the logout API and redirects to / with the cleared cookie forwarded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "set-cookie": "id=; Max-Age=0" },
      })
    )

    const response = await action(
      makeArgs("http://test/logout", { method: "POST" })
    )

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe("/")
    expect(response.headers.get("Set-Cookie")).toBe("id=; Max-Age=0")

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://localhost:3000/api/v1/auth/logout")
    expect(init?.method).toBe("POST")
  })

  it("still redirects to / even with no prior session (idempotent)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200 })
    )

    const response = await action(
      makeArgs("http://test/logout", { method: "POST" })
    )

    expect(response.headers.get("Location")).toBe("/")
  })
})
