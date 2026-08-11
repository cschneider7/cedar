import { getAuth } from "@clerk/react-router/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { S3_BUCKET, s3Client } from "~/lib/s3.server"
import type { Route } from "./+types/student-image"

/**
 * Streams a private student photo object after confirming the requesting
 * session owns it — the key's `students/{userId}/` prefix is the check.
 */
export async function loader(args: Route.LoaderArgs) {
  const { isAuthenticated, userId } = await getAuth(args)
  if (!isAuthenticated) {
    throw new Response("Unauthorized", { status: 401 })
  }

  const key = new URL(args.request.url).searchParams.get("key")
  if (!key) {
    throw new Response("Missing key", { status: 400 })
  }

  if (!key.startsWith(`students/${userId}/`)) {
    throw new Response("Forbidden", { status: 403 })
  }

  let result
  try {
    result = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key })
    )
  } catch {
    throw new Response("Not found", { status: 404 })
  }
  if (!result.Body) {
    throw new Response("Not found", { status: 404 })
  }

  return new Response(result.Body.transformToWebStream(), {
    headers: {
      "content-type": result.ContentType || "application/octet-stream",
      "cache-control": result.CacheControl || "private, max-age=3600",
    },
  })
}
