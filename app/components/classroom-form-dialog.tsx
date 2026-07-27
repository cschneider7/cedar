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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Spinner } from "~/components/ui/spinner"
import type { MutationResult } from "~/lib/action-results"
import type { Classroom } from "~/lib/schemas"
import { CreateClassroomSchema, UpdateClassroomSchema } from "~/lib/schemas"

const periodOptions = Array.from({ length: 9 }, (_, i) => ({
  label: i.toString(),
  value: i,
}))

type ClassroomFormDialogProps = (
  | { mode: "create" }
  | { mode: "edit"; classroom: Classroom }
) & {
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ClassroomFormDialog(props: ClassroomFormDialogProps) {
  const { mode, trigger } = props
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = props.open ?? uncontrolledOpen
  const setOpen = props.onOpenChange ?? setUncontrolledOpen
  const navigate = useNavigate()
  const fetcher = useFetcher<MutationResult>()
  const isSubmitting = fetcher.state !== "idle"

  const actionPath =
    mode === "create"
      ? "/classrooms/new"
      : `/classrooms/${props.classroom.id}/edit`

  const schema =
    mode === "create" ? CreateClassroomSchema : UpdateClassroomSchema

  const defaultValues =
    mode === "create"
      ? { subject: "" }
      : { subject: props.classroom.subject, period: props.classroom.period }

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
    }
  }, [open])

  const onSubmit = (data: z.infer<typeof schema>) => {
    const submitData =
      mode === "create"
        ? data
        : Object.fromEntries(
            Object.entries(data).filter(
              ([key]) => dirtyFields[key as keyof typeof dirtyFields]
            )
          )
    fetcher.submit(submitData, {
      method: "post",
      action: actionPath,
      encType: "application/json",
    })
  }

  useEffect(() => {
    const data = fetcher.data
    if (fetcher.state === "idle" && data?.ok) {
      setOpen(false)
      toast.success(
        mode === "create" ? "Classroom created" : "Classroom updated",
        {
          action: {
            label: "View",
            onClick: () => navigate(`/classrooms/${data.id}`),
          },
        }
      )
    }
  }, [fetcher.state, fetcher.data])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create new classroom" : "Edit classroom"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Enter new classroom info here."
              : "Enter classroom info here."}
          </DialogDescription>
        </DialogHeader>
        {fetcher.data && !fetcher.data.ok && (
          <Alert variant="destructive">
            <AlertDescription>{fetcher.data.error}</AlertDescription>
          </Alert>
        )}
        <form id="classroom-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="subject"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    Subject<span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    placeholder="Math 2"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="period"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    Period Number
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Select
                    name={field.name}
                    value={field.value}
                    onValueChange={field.onChange}
                    items={periodOptions}
                  >
                    <SelectTrigger
                      aria-invalid={fieldState.invalid}
                      className="w-full max-w-48"
                    >
                      <SelectValue placeholder="Select a period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {periodOptions.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
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
          <Button type="submit" form="classroom-form" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
