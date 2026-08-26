import { ImageIcon, PencilIcon, XIcon } from "lucide-react"
import { useRef, useState } from "react"
import ReactCrop, {
  centerCrop,
  cropToCanvas,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { FieldError } from "~/components/ui/field"
import { useStudentImage } from "~/hooks/use-student-image"
import {
  loadImage,
  OUTPUT_IMAGE_QUALITY,
  OUTPUT_IMAGE_TYPE,
  resizeImageToBlob,
  validateImageFile,
} from "~/lib/image-utils"

/**
 * The photo a student form is currently holding: an untouched existing
 * photo, a staged local file, an explicit removal, or nothing at all.
 */
export type PhotoFieldValue =
  | { kind: "existing"; studentId: string }
  | { kind: "staged"; file: File; previewUrl: string }
  | { kind: "removed" }
  | { kind: "none" }

/**
 * Centers a 1:1 aspect crop within the given image dimensions.
 * @param width - The image's width.
 * @param height - The image's height.
 * @returns A centered, percentage-based square crop.
 */
function centeredSquareCrop(width: number, height: number) {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 100 }, 1, width, height),
    width,
    height
  )
}

/**
 * Select → validate → resize → crop flow for a student photo — stages a
 * local `File` via `onChange`; nothing is uploaded until form submit.
 */
export function StudentPhotoField({
  value,
  onChange,
  onCropDialogOpenChange,
}: {
  value: PhotoFieldValue
  onChange: (value: PhotoFieldValue) => void
  /** Notified when the crop dialog opens/closes, so a caller nesting this
   * field can suspend its own dialog while the crop dialog is stacked on top. */
  onCropDialogOpenChange?: (open: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [cropSource, setCropSource] = useState<{ previewUrl: string } | null>(
    null
  )
  const [crop, setCrop] = useState<PixelCrop>()
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function closeCropStep() {
    if (cropSource) URL.revokeObjectURL(cropSource.previewUrl)
    setCropSource(null)
    setCrop(undefined)
    onCropDialogOpenChange?.(false)
  }

  async function handleFileSelected(file: File) {
    setError(null)
    const validationError = validateImageFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    const original = await loadImage(file)
    const resizedBlob = await resizeImageToBlob(original)
    setCropSource({ previewUrl: URL.createObjectURL(resizedBlob) })
    onCropDialogOpenChange?.(true)
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    setCrop(convertToPixels(centeredSquareCrop(width, height), width, height))
  }

  async function handleConfirmCrop() {
    const canvas = canvasRef.current
    if (!cropSource || !imgRef.current || !canvas || !crop) return

    await cropToCanvas(imgRef.current, canvas, crop)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Failed to crop image.")
          return
        }
        const file = new File([blob], "photo.webp", {
          type: OUTPUT_IMAGE_TYPE,
        })
        onChange({
          kind: "staged",
          file,
          previewUrl: URL.createObjectURL(file),
        })
        closeCropStep()
      },
      OUTPUT_IMAGE_TYPE,
      OUTPUT_IMAGE_QUALITY
    )
  }

  const existingImageUrl = useStudentImage(
    value.kind === "existing" ? value.studentId : "",
    value.kind === "existing"
  )

  const previewUrl =
    value.kind === "existing"
      ? existingImageUrl
      : value.kind === "staged"
        ? value.previewUrl
        : null

  return (
    <div className="flex flex-col gap-1">
      <div className="relative size-16 shrink-0">
        <div className="size-16 overflow-hidden rounded-full bg-muted">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Student photo preview"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-6" />
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          className="absolute -top-1 -left-1 rounded-full"
          aria-label={previewUrl ? "Replace photo" : "Add photo"}
          onClick={() => fileInputRef.current?.click()}
        >
          <PencilIcon />
        </Button>
        {previewUrl ? (
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className="absolute -top-1 -right-1 rounded-full"
            aria-label="Remove photo"
            onClick={() => onChange({ kind: "removed" })}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
      {error ? <FieldError errors={[{ message: error }]} /> : null}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void handleFileSelected(file)
        }}
      />

      <Dialog
        open={!!cropSource}
        onOpenChange={(open) => {
          if (!open) closeCropStep()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crop photo</DialogTitle>
            <DialogDescription>
              Drag to adjust the crop, then use the photo or cancel.
            </DialogDescription>
          </DialogHeader>
          {cropSource && (
            <div className="flex items-center justify-center">
              <ReactCrop
                crop={crop}
                onChange={(pixelCrop) => setCrop(pixelCrop)}
                aspect={1}
                circularCrop
              >
                <img
                  ref={imgRef}
                  src={cropSource.previewUrl}
                  alt="Crop preview of uploaded photo"
                  onLoad={handleImageLoad}
                />
              </ReactCrop>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCropStep}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmCrop}>
              Use photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Converts a percentage-based crop to pixel units.
 * @param crop - The crop to convert; returned as-is if already in pixels.
 * @param containerWidth - The width the crop's percentages are relative to.
 * @param containerHeight - The height the crop's percentages are relative to.
 * @returns The equivalent pixel-based crop.
 */
function convertToPixels(
  crop: Crop,
  containerWidth: number,
  containerHeight: number
): PixelCrop {
  if (crop.unit === "px") return crop as PixelCrop
  return {
    unit: "px",
    x: (crop.x / 100) * containerWidth,
    y: (crop.y / 100) * containerHeight,
    width: (crop.width / 100) * containerWidth,
    height: (crop.height / 100) * containerHeight,
  }
}
