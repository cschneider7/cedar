import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { useEffect, useRef } from "react"
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
import { useResourceFormDialog } from "~/hooks/use-resource-form-dialog"
import type { Classroom } from "~/lib/schemas"
import { CreateClassroomSchema, UpdateClassroomSchema } from "~/lib/schemas"

// Periods are 1-indexed to match CreateClassroomSchema/UpdateClassroomSchema's
// `.positive()` constraint on `period` — don't offer a "Period 0" option.
const periodOptions = Array.from({ length: 9 }, (_, i) => ({
  label: (i + 1).toString(),
  value: i + 1,
}))

type ClassroomFormDialogProps = (
  { mode: "create" } | { mode: "edit"; classroom: Classroom }
) & {
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ClassroomFormDialog(props: ClassroomFormDialogProps) {
  const { mode, trigger } = props

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

  const { open, setOpen, isSubmitting, submitError, buildSubmitData, submit } =
    useResourceFormDialog({
      open: props.open,
      onOpenChange: props.onOpenChange,
      mode,
      form,
      defaultValues,
      actionPath,
      entityLabel: "Classroom",
    })

  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (submitError) {
      errorRef.current?.focus()
    }
  }, [submitError])

  const onSubmit = (data: z.infer<typeof schema>) => {
    submit(buildSubmitData(data))
  }

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
        {submitError && (
          <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
            <AlertDescription>{submitError}</AlertDescription>
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
