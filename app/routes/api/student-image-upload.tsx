import { getAuth } from "@clerk/react-router/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import type { Route } from "./+types/student-image-upload"

// The client always converts to webp before uploading (see image-utils.ts),
// so this is the only content type Blob should ever actually accept here.
const ALLOWED_CONTENT_TYPES = ["image/webp"]
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024

/** Issues client upload tokens for student photos (see `@vercel/blob/client`'s
 * `handleUpload` contract) and otherwise no-ops — the `image_url` itself is
 * saved via the normal create/update student API call, not this route. */
export async function action(args: Route.ActionArgs) {
  const { isAuthenticated, userId } = await getAuth(args)
  if (!isAuthenticated) {
    throw new Response("Unauthorized", { status: 401 })
  }

  const body = (await args.request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: args.request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`students/${userId}/`)) {
          throw new Error("pathname must be scoped to the current user")
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_SIZE_BYTES,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return Response.json(jsonResponse)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 })
  }
}
