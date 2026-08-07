export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_EDGE_PX = 1024

// Every upload is normalized to this format/quality regardless of the
// source file's type, so storage/bandwidth stay predictable.
export const OUTPUT_IMAGE_TYPE = "image/webp"
export const OUTPUT_IMAGE_QUALITY = 0.85

/**
 * Builds the URL a student's private photo must be fetched through, since
 * the S3-compatible bucket is private (see the "api/student-image" resource
 * route, which authenticates the request and streams the object).
 * @param imageKey - The student's stored `image_url` (an S3 object key)
 * @returns The proxy URL to use as an `<img>` `src`
 */
export function studentImageProxyUrl(imageKey: string): string {
  return `/api/student-image?key=${encodeURIComponent(imageKey)}`
}

/**
 * Computes aspect-ratio-preserving output dimensions capped to a max edge
 * length, leaving already-small dimensions untouched.
 * @param width - Original width in pixels
 * @param height - Original height in pixels
 * @param maxEdge - Maximum allowed length for the longer edge
 * @returns The resized `{ width, height }`, rounded to whole pixels
 */
export function computeResizedDimensions(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longerEdge = Math.max(width, height)
  if (longerEdge <= maxEdge) {
    return { width, height }
  }

  const scale = maxEdge / longerEdge
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

/**
 * Draws an image onto a canvas at its resized dimensions and exports it as a
 * `OUTPUT_IMAGE_TYPE` blob, downscaling so its longer edge is at most
 * `MAX_IMAGE_EDGE_PX`, regardless of the source image's original format.
 * @param image - Source image to resize
 * @returns The resized image as a `Blob`
 */
export async function resizeImageToBlob(
  image: HTMLImageElement
): Promise<Blob> {
  const { width, height } = computeResizedDimensions(
    image.naturalWidth,
    image.naturalHeight,
    MAX_IMAGE_EDGE_PX
  )

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Could not get canvas context")
  }
  ctx.drawImage(image, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error("Failed to export resized image"))
        }
      },
      OUTPUT_IMAGE_TYPE,
      OUTPUT_IMAGE_QUALITY
    )
  })
}

/**
 * Loads a `File`/`Blob` into an `HTMLImageElement` for canvas operations.
 * @param file - Image file to load
 * @returns The loaded image, ready to draw onto a canvas
 */
export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to load image"))
    }
    image.src = url
  })
}

/**
 * Validates a file's type and size against the student photo constraints.
 * @param file - File selected by the user
 * @returns An error message if invalid, or `null` if the file is acceptable
 */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Please choose a JPEG, PNG, or WebP image."
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "Image must be smaller than 5MB."
  }
  return null
}
