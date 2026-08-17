import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { useEffect, useRef, useState } from "react"
import { useFetcher } from "react-router"
import * as z from "zod"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Spinner } from "~/components/ui/spinner"
import {
  StudentPhotoField,
  type PhotoFieldValue,
} from "~/components/student-photo-field"
import { useResourceFormDialog } from "~/hooks/use-resource-form-dialog"
import { formatClassroomName } from "~/lib/classroom-term"
import type { Classroom, Student } from "~/lib/schemas"
import { CreateStudentSchema, UpdateStudentSchema } from "~/lib/schemas"

type StudentFormDialogProps = (
  { mode: "create" } | { mode: "edit"; student: Student }
) & {
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Derives the form's initial photo state: the existing photo in edit
 * mode, or none for a new student.
 * @param props - The dialog's props, used to check mode and any existing photo.
 * @returns The initial photo field value.
 */
function defaultPhotoValue(props: StudentFormDialogProps): PhotoFieldValue {
  if (props.mode === "edit" && props.student.image_url) {
    return { kind: "existing", url: props.student.image_url }
  }
  return { kind: "none" }
}

/**
 * Create/edit student dialog: photo, name, student ID, and classroom
 * fields; the staged photo uploads only once the form is submitted.
 */
export function StudentFormDialog(props: StudentFormDialogProps) {
  const { mode, trigger } = props

  const [photo, setPhoto] = useState<PhotoFieldValue>(() =>
    defaultPhotoValue(props)
  )
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // While the crop-photo dialog (stacked on top) is open, this dialog must
  // stay put — no closing, no interacting with fields behind its backdrop.
  const [isCropping, setIsCropping] = useState(false)

  const formPath =
    mode === "create" ? "/students/new" : `/students/${props.student.id}/edit`

  const schema = mode === "create" ? CreateStudentSchema : UpdateStudentSchema

  const defaultValues =
    mode === "create"
      ? { name: "", classroom_id: null }
      : {
          name: props.student.name,
          student_id: props.student.student_id,
          classroom_id: props.student.classroom_id,
        }

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const { open, setOpen, isSubmitting, submitError, buildSubmitData, submit } =
    useResourceFormDialog({
      open: props.open,
      onOpenChange: props.onOpenChange,
      mode,
      form,
      defaultValues,
      actionPath: formPath,
      entityLabel: "Student",
      onOpen: () => {
        setPhoto(defaultPhotoValue(props))
        setUploadError(null)
      },
    })

  const classroomsFetcher = useFetcher<{ classrooms: Classroom[] }>()
  // Only fires on open, not on every classroomsFetcher re-render (it changes
  // identity as load() progresses) - otherwise this would loop.
  useEffect(() => {
    if (open && classroomsFetcher.state === "idle" && !classroomsFetcher.data) {
      classroomsFetcher.load(formPath)
    }
  }, [open])
  const classrooms = classroomsFetcher.data?.classrooms ?? []

  const displayedError = uploadError || submitError
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (displayedError) {
      errorRef.current?.focus()
    }
  }, [displayedError])

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setUploadError(null)
    const submitData = buildSubmitData(data)

    if (photo.kind === "staged") {
      setIsUploading(true)
      try {
        const tokenRes = await fetch("/api/student-image-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentLength: photo.file.size }),
        })
        if (!tokenRes.ok) {
          throw new Error("Failed to prepare photo upload")
        }
        const { url, key } = (await tokenRes.json()) as {
          url: string
          key: string
        }

        const putRes = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": photo.file.type },
          body: photo.file,
        })
        if (!putRes.ok) {
          throw new Error("Failed to upload photo")
        }

        submitData.image_url = key
      } catch (error) {
        setUploadError((error as Error).message)
        setIsUploading(false)
        return
      }
      setIsUploading(false)
    } else if (photo.kind === "removed") {
      submitData.image_url = null
    } else if (mode === "create" && photo.kind === "none") {
      submitData.image_url = null
    }

    submit(submitData)
  }

  const classroomOptions: { label: string; value: string | null }[] = [
    { label: "Unassigned", value: null },
  ]
  classrooms.forEach((classroom) => {
    classroomOptions.push({
      label: formatClassroomName(classroom),
      value: classroom.id,
    })
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isCropping) return
        setOpen(next)
      }}
    >
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent inert={isCropping || undefined}>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create new student" : "Edit student"}
          </DialogTitle>
        </DialogHeader>
        {displayedError && (
          <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
            <AlertDescription>{displayedError}</AlertDescription>
          </Alert>
        )}
        <form id="student-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <div className="flex items-start gap-4">
              <Field className="w-auto shrink-0">
                <StudentPhotoField
                  value={photo}
                  onChange={setPhoto}
                  onCropDialogOpenChange={setIsCropping}
                />
              </Field>
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
                    <FieldLabel>
                      Name<span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      placeholder="Bob Burger"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
            <div className="flex items-start gap-4">
              <Controller
                name="student_id"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
                    <FieldLabel>
                      Student ID Number
                      <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      placeholder="123456"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="classroom_id"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
                    <FieldLabel>Classroom</FieldLabel>
                    <Select
                      name={field.name}
                      value={field.value}
                      onValueChange={field.onChange}
                      items={classroomOptions}
                    >
                      <SelectTrigger
                        aria-invalid={fieldState.invalid}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {classroomOptions.map((classroom) => (
                          <SelectItem
                            key={classroom.value}
                            value={classroom.value}
                          >
                            {classroom.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            form="student-form"
            disabled={isSubmitting || isUploading}
          >
            {(isSubmitting || isUploading) && <Spinner />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
