import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { useEffect, useState } from "react"
import { useFetcher, useNavigate } from "react-router"
import { toast } from "sonner"
import * as z from "zod"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Field,
  FieldDescription,
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
import type { MutationResult } from "~/lib/action-results"
import type { Classroom, Student } from "~/lib/schemas"
import { CreateStudentSchema, UpdateStudentSchema } from "~/lib/schemas"

type StudentFormDialogProps = (
  { mode: "create" } | { mode: "edit"; student: Student }
) & {
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function defaultPhotoValue(props: StudentFormDialogProps): PhotoFieldValue {
  if (props.mode === "edit" && props.student.image_url) {
    return { kind: "existing", url: props.student.image_url }
  }
  return { kind: "none" }
}

export function StudentFormDialog(props: StudentFormDialogProps) {
  const { mode, trigger } = props
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = props.open ?? uncontrolledOpen
  const setOpen = props.onOpenChange ?? setUncontrolledOpen
  const navigate = useNavigate()

  const [photo, setPhoto] = useState<PhotoFieldValue>(() =>
    defaultPhotoValue(props)
  )
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const formPath =
    mode === "create" ? "/students/new" : `/students/${props.student.id}/edit`

  const classroomsFetcher = useFetcher<{ classrooms: Classroom[] }>()
  // Only fires on open, not on every classroomsFetcher re-render (it changes
  // identity as load() progresses) - otherwise this would loop.
  useEffect(() => {
    if (open && classroomsFetcher.state === "idle" && !classroomsFetcher.data) {
      classroomsFetcher.load(formPath)
    }
  }, [open])
  const classrooms = classroomsFetcher.data?.classrooms ?? []

  const submitFetcher = useFetcher<MutationResult>()
  const isSubmitting = submitFetcher.state !== "idle"

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

  // formState is a proxy; dirtyFields must be read here, not inside onSubmit.
  const { dirtyFields } = form.formState

  // The dialog stays mounted (see loop rendering it), so the form must be
  // reset on each open or stale/dirty values from the last session persist.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
      setPhoto(defaultPhotoValue(props))
      setUploadError(null)
    }
  }, [open])

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setUploadError(null)
    const submitData: Record<string, unknown> =
      mode === "create"
        ? { ...data }
        : Object.fromEntries(
            Object.entries(data).filter(
              ([key]) => dirtyFields[key as keyof typeof dirtyFields]
            )
          )

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

    submitFetcher.submit(submitData as z.infer<typeof schema>, {
      method: "post",
      action: formPath,
      encType: "application/json",
    })
  }

  useEffect(() => {
    const data = submitFetcher.data
    if (submitFetcher.state === "idle" && data?.ok) {
      setOpen(false)
      toast.success(mode === "create" ? "Student created" : "Student updated", {
        action: {
          label: "View",
          onClick: () => navigate(`/students/${data.id}`),
        },
      })
    }
  }, [submitFetcher.state, submitFetcher.data])

  const classroomOptions: [{ label: string; value: string | null }] = [
    { label: "Unassigned", value: null },
  ]
  classrooms.forEach((classroom) => {
    classroomOptions.push({
      label: `Period ${classroom.period} - ${classroom.subject}`,
      value: classroom.id,
    })
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create new student" : "Edit student"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Enter new student info here."
              : "Enter student info here."}
          </DialogDescription>
        </DialogHeader>
        {(uploadError ||
          (submitFetcher.data &&
            !submitFetcher.data.ok &&
            submitFetcher.data.error)) && (
          <Alert variant="destructive">
            <AlertDescription>
              {uploadError ||
                (submitFetcher.data && !submitFetcher.data.ok
                  ? submitFetcher.data.error
                  : null)}
            </AlertDescription>
          </Alert>
        )}
        <form id="student-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Field>
              <FieldLabel>Photo</FieldLabel>
              <StudentPhotoField value={photo} onChange={setPhoto} />
            </Field>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
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
            <Controller
              name="student_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
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
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Classroom</FieldLabel>
                  <FieldDescription>
                    The classroom the student is enrolled in
                  </FieldDescription>
                  <Select
                    name={field.name}
                    value={field.value}
                    onValueChange={field.onChange}
                    items={classroomOptions}
                  >
                    <SelectTrigger
                      aria-invalid={fieldState.invalid}
                      className="w-full max-w-48"
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
