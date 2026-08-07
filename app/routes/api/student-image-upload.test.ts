import { getAuth } from "@clerk/react-router/server"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { describe, expect, it, vi } from "vitest"
import { makeArgs } from "~/lib/test-utils"
import { action } from "./student-image-upload"

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn((input: unknown) => input),
}))
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}))
vi.mock("~/lib/s3.server", () => ({
  s3PublicClient: {},
  S3_BUCKET: "test-bucket",
}))

function authenticatedAs(userId: string) {
  vi.mocked(getAuth).mockResolvedValueOnce({
    isAuthenticated: true,
    userId,
    getToken: async () => "test-token",
  } as Awaited<ReturnType<typeof getAuth>>)
}

const args = (contentLength?: number) =>
  makeArgs("http://test/api/student-image-upload", {
    method: "POST",
    body: { contentLength },
  })

describe("student-image-upload action", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    try {
      await action(args(1024))
      expect.fail("expected a 401 to be thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      expect((response as Response).status).toBe(401)
    }
  })

  it("returns 400 when contentLength is missing", async () => {
    authenticatedAs("user_1")
    const response = await action(args(undefined))
    expect(response.status).toBe(400)
  })

  it("returns 400 when contentLength exceeds the 5MB limit", async () => {
    authenticatedAs("user_1")
    const response = await action(args(6 * 1024 * 1024))
    expect(response.status).toBe(400)
  })

  it("returns a presigned url and a key scoped to the current user", async () => {
    authenticatedAs("user_1")
    vi.mocked(getSignedUrl).mockResolvedValueOnce(
      "https://minio.example/presigned"
    )

    const response = await action(args(1024))
    const json = await response.json()

    expect(json.url).toBe("https://minio.example/presigned")
    expect(json.key).toMatch(/^students\/user_1\/.+\.webp$/)
  })
})
