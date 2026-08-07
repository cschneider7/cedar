import { getAuth } from "@clerk/react-router/server"
import { get } from "@vercel/blob"
import { describe, expect, it, vi } from "vitest"
import { makeArgs } from "~/lib/test-utils"
import { loader } from "./student-image"

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
}))

const BLOB_URL =
  "https://store123.private.blob.vercel-storage.com/students/user_1/photo.jpg"

function authenticatedAs(userId: string) {
  vi.mocked(getAuth).mockResolvedValueOnce({
    isAuthenticated: true,
    userId,
    getToken: async () => "test-token",
  } as Awaited<ReturnType<typeof getAuth>>)
}

const args = (url?: string) =>
  makeArgs(
    `http://test/api/student-image${url ? `?url=${encodeURIComponent(url)}` : ""}`
  )

async function expectStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise
    expect.fail(`expected a ${status} response to be thrown`)
  } catch (response) {
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(status)
  }
}

describe("student-image loader", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    await expectStatus(loader(args(BLOB_URL)), 401)
  })

  it("returns 400 when the url param is missing", async () => {
    authenticatedAs("user_1")
    await expectStatus(loader(args()), 400)
  })

  it("returns 400 for a malformed url", async () => {
    authenticatedAs("user_1")
    await expectStatus(loader(args("not-a-url")), 400)
  })

  it("returns 403 when the pathname isn't scoped to the current user", async () => {
    authenticatedAs("user_1")
    await expectStatus(
      loader(
        args(
          "https://store123.private.blob.vercel-storage.com/students/someone-else/photo.jpg"
        )
      ),
      403
    )
    expect(get).not.toHaveBeenCalled()
  })

  it("returns 404 when the blob doesn't exist", async () => {
    authenticatedAs("user_1")
    vi.mocked(get).mockResolvedValueOnce(null)

    await expectStatus(loader(args(BLOB_URL)), 404)
  })

  it("returns 404 when get() throws", async () => {
    authenticatedAs("user_1")
    vi.mocked(get).mockRejectedValueOnce(new Error("boom"))

    await expectStatus(loader(args(BLOB_URL)), 404)
  })

  it("streams the blob with its content-type and cache-control", async () => {
    authenticatedAs("user_1")
    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream(),
      headers: new Headers(),
      blob: {
        url: BLOB_URL,
        downloadUrl: `${BLOB_URL}?download=1`,
        pathname: "students/user_1/photo.jpg",
        contentDisposition: "inline",
        cacheControl: "public, max-age=3600",
        uploadedAt: new Date(),
        etag: "etag-1",
        contentType: "image/jpeg",
        size: 1024,
      },
    })

    const response = (await loader(args(BLOB_URL))) as Response
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600")
    expect(get).toHaveBeenCalledWith(BLOB_URL, { access: "private" })
  })
})
