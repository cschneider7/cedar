import { useEffect, useState } from "react"
import type { FieldValues, UseFormReturn } from "react-hook-form"
import { useFetcher } from "react-router"
import { toast } from "~/components/ui/toast"
import type { MutationResult } from "~/lib/action-results"

type UseResourceFormDialogOptions<TFieldValues extends FieldValues> = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  mode: "create" | "edit"
  /** The caller's own `useForm<...>()` instance — kept in the calling
   * component since threading zod's generics through this hook isn't worth it. */
  form: UseFormReturn<TFieldValues>
  defaultValues: TFieldValues
  actionPath: string
  /** e.g. "Student" / "Classroom" — used for the success toast copy. */
  entityLabel: string
  /**
   * Extra reset logic to run alongside `form.reset` when the dialog opens —
   * it stays permanently mounted, so stale state must be cleared each time.
   */
  onOpen?: () => void
}

/**
 * Shared state machine behind `StudentFormDialog`/`ClassroomFormDialog`:
 * open state, reset-on-open, a submit fetcher, and the success toast + close.
 * @param options - Open state, the caller's form instance, and submit target,
 * see `UseResourceFormDialogOptions`.
 * @returns Open state, submit/error state, and helpers to build and submit
 * the payload.
 */
export function useResourceFormDialog<TFieldValues extends FieldValues>({
  open: openProp,
  onOpenChange,
  mode,
  form,
  defaultValues,
  actionPath,
  entityLabel,
  onOpen,
}: UseResourceFormDialogOptions<TFieldValues>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  // formState is a proxy; dirtyFields must be read here, not inside submit.
  const { dirtyFields } = form.formState

  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
      onOpen?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const fetcher = useFetcher<MutationResult>()
  const isSubmitting = fetcher.state !== "idle"
  const submitError =
    fetcher.data && !fetcher.data.ok ? fetcher.data.error : null

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setOpen(false)
      toast.add({
        title: `${entityLabel} ${mode === "create" ? "created" : "updated"}`,
        type: "success",
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data])

  /**
   * Dirty-field-filtered (edit) or full (create) payload — callers extend
   * this with their own fields (e.g. an uploaded photo key) before submitting.
   * @param data - The form's current values.
   * @returns The payload to submit.
   */
  function buildSubmitData(data: TFieldValues): Partial<TFieldValues> {
    if (mode === "create") {
      return { ...data }
    }
    return Object.fromEntries(
      Object.entries(data).filter(
        ([key]) => dirtyFields[key as keyof typeof dirtyFields]
      )
    ) as Partial<TFieldValues>
  }

  function submit(payload: Partial<TFieldValues>) {
    // fetcher.submit expects JsonValue, which our already JSON-safe payload
    // doesn't structurally match — cast contained here, not at every call site.
    fetcher.submit(payload as Record<string, unknown> as never, {
      method: "post",
      action: actionPath,
      encType: "application/json",
    })
  }

  return {
    open,
    setOpen,
    isSubmitting,
    submitError,
    buildSubmitData,
    submit,
  }
}
