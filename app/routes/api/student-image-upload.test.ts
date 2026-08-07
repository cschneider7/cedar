import { getAuth } from "@clerk/react-router/server"
import { handleUpload } from "@vercel/blob/client"
import { describe, expect, it, vi } from "vitest"
import { makeArgs } from "~/lib/test-utils"
import { action } from "./student-image-upload"

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(),
}))

function authenticatedAs(userId: string) {
  vi.mocked(getAuth).mockResolvedValueOnce({
    isAuthenticated: true,
    userId,
    getToken: async () => "test-token",
  } as Awaited<ReturnType<typeof getAuth>>)
}

const args = () =>
  makeArgs("http://test/api/student-image-upload", {
    method: "POST",
    body: { type: "blob.generate-client-token", payload: {} },
  })

describe("student-image-upload action", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      getToken: async () => null,
    } as Awaited<ReturnType<typeof getAuth>>)

    try {
      await action(args())
      expect.fail("expected a 401 to be thrown")
    } catch (response) {
      expect(response).toBeInstanceOf(Response)
      expect((response as Response).status).toBe(401)
    }
  })

  it("constrains the token and scopes the pathname to the current user", async () => {
    authenticatedAs("user_1")
    vi.mocked(handleUpload).mockImplementationOnce(
      async ({ onBeforeGenerateToken }) => {
        const constraints = await onBeforeGenerateToken(
          "students/user_1/photo.jpg",
          null,
          false
        )
        return {
          type: "blob.generate-client-token" as const,
          clientToken: JSON.stringify(constraints),
        }
      }
    )

    const response = await action(args())
    const json = await response.json()
    const constraints = JSON.parse(json.clientToken)

    expect(constraints).toEqual({
      allowedContentTypes: ["image/webp"],
      maximumSizeInBytes: 5 * 1024 * 1024,
      addRandomSuffix: true,
    })
  })

  it("rejects a pathname not scoped to the current user", async () => {
    authenticatedAs("user_1")
    vi.mocked(handleUpload).mockImplementationOnce(
      async ({ onBeforeGenerateToken }) => {
        await onBeforeGenerateToken(
          "students/someone-else/photo.jpg",
          null,
          false
        )
        return { type: "blob.generate-client-token" as const, clientToken: "" }
      }
    )

    const response = await action(args())
    expect(response.status).toBe(400)
  })

  it("no-ops onUploadCompleted, leaving image_url persistence to the student API call", async () => {
    authenticatedAs("user_1")
    vi.mocked(handleUpload).mockImplementationOnce(
      async ({ onUploadCompleted }) => {
        await onUploadCompleted?.({
          blob: {
            pathname: "students/user_1/photo.jpg",
            contentType: "image/jpeg",
            contentDisposition: "inline",
            url: "https://example.public.blob.vercel-storage.com/photo.jpg",
            downloadUrl:
              "https://example.public.blob.vercel-storage.com/photo.jpg?download=1",
            etag: "etag-1",
          },
        })
        return {
          type: "blob.upload-completed" as const,
          response: "ok" as const,
        }
      }
    )

    const response = await action(args())
    expect(response.status).toBe(200)
  })
})
