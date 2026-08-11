import { S3Client } from "@aws-sdk/client-s3"

export const S3_BUCKET = requireEnv("S3_BUCKET")

/**
 * Server-reachable S3 client (MinIO's docker-network hostname locally) —
 * used for calls the server makes directly, e.g. the read proxy's `GetObjectCommand`.
 */
export const s3Client = buildClient(requireEnv("S3_ENDPOINT"))

/**
 * Browser-reachable S3 client, used only to presign the upload PUT URL —
 * MinIO's docker-network hostname isn't resolvable from the host locally.
 */
export const s3PublicClient = buildClient(
  process.env.S3_PUBLIC_ENDPOINT || requireEnv("S3_ENDPOINT")
)

/**
 * Reads a required environment variable, throwing if it's unset.
 * @param name - The environment variable's name.
 * @returns The variable's value.
 */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} must be set`)
  }
  return value
}

/**
 * Builds an S3 client for the given endpoint, using shared credentials.
 * @param endpoint - The S3-compatible endpoint URL.
 * @returns A configured `S3Client`.
 */
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
