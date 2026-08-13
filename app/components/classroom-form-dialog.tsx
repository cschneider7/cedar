import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { useEffect, useRef } from "react"
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
  FieldLegend,
  FieldSeparator,
  FieldSet,
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
import { termSeasonOptions } from "~/lib/classroom-term"
import type { Classroom } from "~/lib/schemas"
import { CreateClassroomSchema, UpdateClassroomSchema } from "~/lib/schemas"

const periodOptions = Array.from({ length: 9 }, (_, i) => ({
  label: i.toString(),
  value: i,
}))

const currentYear = new Date().getFullYear()
const yearOptions = Array.from({ length: 11 }, (_, i) => {
  const year = currentYear - 5 + i
  return { label: year.toString(), value: year }
})

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
      ? { subject: "", term_year: currentYear }
      : {
          subject: props.classroom.subject,
          period: props.classroom.period,
          term_season: props.classroom.term_season,
          term_year: props.classroom.term_year,
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
        </DialogHeader>
        {submitError && (
          <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
        <form id="classroom-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <div className="flex items-start gap-4">
              <Controller
                name="subject"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
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
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
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
                        className="w-full"
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
            </div>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend variant="label">Academic Term</FieldLegend>
              <div className="flex items-start gap-4">
                <Controller
                  name="term_season"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex-1"
                      data-invalid={fieldState.invalid}
                    >
                      <FieldLabel className="font-normal">
                        Season<span className="text-destructive">*</span>
                      </FieldLabel>
                      <Select
                        name={field.name}
                        value={field.value}
                        onValueChange={field.onChange}
                        items={termSeasonOptions}
                      >
                        <SelectTrigger
                          aria-invalid={fieldState.invalid}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select a season" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {termSeasonOptions.map((item) => (
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
                <Controller
                  name="term_year"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex-1"
                      data-invalid={fieldState.invalid}
                    >
                      <FieldLabel className="font-normal">
                        Year<span className="text-destructive">*</span>
                      </FieldLabel>
                      <Select
                        name={field.name}
                        value={field.value}
                        onValueChange={field.onChange}
                        items={yearOptions}
                      >
                        <SelectTrigger
                          aria-invalid={fieldState.invalid}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select a year" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {yearOptions.map((item) => (
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
              </div>
            </FieldSet>
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
