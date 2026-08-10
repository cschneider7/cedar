import { useEffect, useState } from "react"
import type { FieldValues, UseFormReturn } from "react-hook-form"
import { useFetcher } from "react-router"
import { toast } from "sonner"
import type { MutationResult } from "~/lib/action-results"

type UseResourceFormDialogOptions<TFieldValues extends FieldValues> = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  mode: "create" | "edit"
  /** The caller's own `useForm<...>()` instance — kept in the calling
   * component (alongside its `zodResolver`) since threading zod's schema
   * generics through this hook fights react-hook-form's own generics for
   * little benefit; this hook only needs to reset/read it. */
  form: UseFormReturn<TFieldValues>
  defaultValues: TFieldValues
  actionPath: string
  /** e.g. "Student" / "Classroom" — used for the success toast copy. */
  entityLabel: string
  /** Extra reset logic to run alongside `form.reset` whenever the dialog
   * opens — the dialog stays permanently mounted, so state from the last
   * session (e.g. `StudentFormDialog`'s staged photo) must be cleared on
   * each open. */
  onOpen?: () => void
}

/** Shared state machine behind `StudentFormDialog`/`ClassroomFormDialog`:
 * controlled/uncontrolled open state, reset-on-open, a submit fetcher with
 * its pending/error state, and the success toast + close. Field markup,
 * the `useForm`/`zodResolver` setup, and any pre-submit async work (e.g.
 * photo upload) stay in the calling component — this only owns the parts
 * identical between the two dialogs. */
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
      toast.success(
        `${entityLabel} ${mode === "create" ? "created" : "updated"}`
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data])

  /** Dirty-field-filtered (edit) or full (create) payload — callers extend
   * this with their own fields (e.g. an uploaded photo key) before
   * submitting. Typed as a real `Partial<TFieldValues>` (not a bare
   * `Record<string, unknown>` cast to the full schema type) so a caller
   * can't accidentally treat a dirty-only edit payload as if it had every
   * field the create payload would. */
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
    // react-router's fetcher.submit types a JSON body as `JsonValue`, which
    // `Partial<TFieldValues>` (whose fields are already known JSON-safe
    // primitives from a zod-validated form) doesn't structurally match
    // inside this generic function body — the boundary cast is contained
    // here rather than repeated, untyped, at every call site.
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
