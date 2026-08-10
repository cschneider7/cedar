import { getAuth } from "@clerk/react-router/server"
import { describe, expect, it, vi } from "vitest"
import { makeArgs } from "~/lib/test-utils"
import { s3Client } from "~/lib/s3.server"
import { loader } from "./student-image"

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: vi.fn(function (input: unknown) {
    return input
  }),
}))
vi.mock("~/lib/s3.server", () => ({
  s3Client: { send: vi.fn() },
  S3_BUCKET: "test-bucket",
}))

const KEY = "students/user_1/photo.webp"

function authenticatedAs(userId: string) {
  vi.mocked(getAuth).mockResolvedValueOnce({
    isAuthenticated: true,
    userId,
    getToken: async () => "test-token",
  } as Awaited<ReturnType<typeof getAuth>>)
}

const args = (key?: string) =>
  makeArgs(
    `http://test/api/student-image${key ? `?key=${encodeURIComponent(key)}` : ""}`
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

    await expectStatus(loader(args(KEY)), 401)
  })

  it("returns 400 when the key param is missing", async () => {
    authenticatedAs("user_1")
    await expectStatus(loader(args()), 400)
  })

  it("returns 403 when the key isn't scoped to the current user", async () => {
    authenticatedAs("user_1")
    await expectStatus(loader(args("students/someone-else/photo.webp")), 403)
    expect(s3Client.send).not.toHaveBeenCalled()
  })

  it("returns 404 when GetObject throws", async () => {
    authenticatedAs("user_1")
    vi.mocked(s3Client.send).mockRejectedValueOnce(new Error("boom"))

    await expectStatus(loader(args(KEY)), 404)
  })

  it("returns 404 when the object has no body", async () => {
    authenticatedAs("user_1")
    vi.mocked(s3Client.send).mockResolvedValueOnce({} as never)

    await expectStatus(loader(args(KEY)), 404)
  })

  it("streams the object with its content-type and cache-control", async () => {
    authenticatedAs("user_1")
    vi.mocked(s3Client.send).mockResolvedValueOnce({
      Body: { transformToWebStream: () => new ReadableStream() },
      ContentType: "image/webp",
      CacheControl: "private, max-age=3600",
    } as never)

    const response = (await loader(args(KEY))) as Response
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/webp")
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600")
  })
})
