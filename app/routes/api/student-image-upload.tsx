import { getAuth } from "@clerk/react-router/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { S3_BUCKET, s3PublicClient } from "~/lib/s3.server"
import type { Route } from "./+types/student-image-upload"

const ALLOWED_CONTENT_TYPE = "image/webp"
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
const PRESIGNED_URL_EXPIRES_IN_SECONDS = 60

/**
 * Issues a presigned S3 PUT URL for a student photo upload — `image_url`
 * itself is saved separately, via the normal create/update student call.
 */
export async function action(args: Route.ActionArgs) {
  const { isAuthenticated, userId } = await getAuth(args)
  if (!isAuthenticated) {
    throw new Response("Unauthorized", { status: 401 })
  }

  const body = (await args.request.json()) as { contentLength?: number }
  const contentLength = body.contentLength
  if (
    typeof contentLength !== "number" ||
    contentLength <= 0 ||
    contentLength > MAX_UPLOAD_SIZE_BYTES
  ) {
    return Response.json({ error: "Invalid content length" }, { status: 400 })
  }

  const key = `students/${userId}/${crypto.randomUUID()}.webp`
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: ALLOWED_CONTENT_TYPE,
    ContentLength: contentLength,
  })

  const url = await getSignedUrl(s3PublicClient, command, {
    expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
  })

  return Response.json({ url, key })
}
