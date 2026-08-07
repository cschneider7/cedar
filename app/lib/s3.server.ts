import { S3Client } from "@aws-sdk/client-s3"

export const S3_BUCKET = requireEnv("S3_BUCKET")

/**
 * Server-reachable S3 client (MinIO's docker-network hostname locally, the
 * real endpoint in Preview/Production) — used for calls the server itself
 * makes directly (the student-image read proxy's `GetObjectCommand`).
 */
export const s3Client = buildClient(requireEnv("S3_ENDPOINT"))

/**
 * Browser-reachable S3 client — used only to presign the upload PUT URL
 * returned to the browser, since MinIO's docker-network hostname isn't
 * resolvable from the host. Same endpoint as `s3Client` outside local dev.
 */
export const s3PublicClient = buildClient(
  process.env.S3_PUBLIC_ENDPOINT || requireEnv("S3_ENDPOINT")
)

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} must be set`)
  }
  return value
}

function buildClient(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: requireEnv("S3_REGION"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  })
}
