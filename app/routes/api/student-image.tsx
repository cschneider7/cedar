import { getAuth } from "@clerk/react-router/server"
import { get } from "@vercel/blob"
import type { Route } from "./+types/student-image"

/** Streams a private student photo blob to the browser after confirming the
 * requesting session owns it — the pathname's `students/{userId}/` prefix
 * (enforced at upload time in `student-image-upload.tsx`) is the ownership
 * check, so no extra round trip to the Rust API is needed. Private blobs
 * have no directly-fetchable URL (see docs/student-images-spec.md), so
 * every `<img>` referencing one must route through this proxy instead of
 * `image_url` directly. */
export async function loader(args: Route.LoaderArgs) {
  const { isAuthenticated, userId } = await getAuth(args)
  if (!isAuthenticated) {
    throw new Response("Unauthorized", { status: 401 })
  }

  const url = new URL(args.request.url).searchParams.get("url")
  if (!url) {
    throw new Response("Missing url", { status: 400 })
  }

  let pathname: string
  try {
    pathname = new URL(url).pathname.replace(/^\//, "")
  } catch {
    throw new Response("Invalid url", { status: 400 })
  }

  if (!pathname.startsWith(`students/${userId}/`)) {
    throw new Response("Forbidden", { status: 403 })
  }

  let result
  try {
    result = await get(url, { access: "private" })
  } catch {
    throw new Response("Not found", { status: 404 })
  }
  if (!result || result.statusCode !== 200) {
    throw new Response("Not found", { status: 404 })
  }

  return new Response(result.stream, {
    headers: {
      "content-type": result.blob.contentType,
      "cache-control": result.blob.cacheControl || "private, max-age=3600",
    },
  })
}
