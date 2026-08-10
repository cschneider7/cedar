import { useEffect } from "react"
import { useFetcher, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

type DeleteResult = { ok: boolean; error?: string }

type UseDeleteResourceOptions = {
  /** Toast message shown on success. */
  successMessage: string
  /** Extra side effect on success, e.g. closing the dialog or clearing a
   * local selection. */
  onDeleted?: () => void
  /** Navigate here on success, if set. */
  navigateTo?: string
  /** Restrict navigation to when the current location matches this prefix
   * (typically the deleted resource's own detail page) — for a dialog used
   * from multiple contexts, some of which aren't viewing what they delete.
   * Omit when the caller is always viewing the resource being deleted. */
  onlyIfViewing?: string
}

/** Shared fetcher-backed delete flow: derives pending/error state, and on
 * success shows a toast, runs `onDeleted`, and optionally navigates.
 * Callers submit via the returned `submit` (forwarded from `useFetcher`) so
 * both a single-id delete (`submit(null, { method: "post", action })`) and
 * a bulk delete (`submit(json, { ..., encType: "application/json" })`)
 * share the same success/error handling. */
export function useDeleteResource({
  successMessage,
  onDeleted,
  navigateTo,
  onlyIfViewing,
}: UseDeleteResourceOptions) {
  const fetcher = useFetcher<DeleteResult>()
  const navigate = useNavigate()
  const location = useLocation()
  const isDeleting = fetcher.state !== "idle"
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) {
      return
    }
    toast.success(successMessage)
    onDeleted?.()
    if (
      navigateTo &&
      (!onlyIfViewing || location.pathname.startsWith(onlyIfViewing))
    ) {
      navigate(navigateTo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data])

  return { isDeleting, error, submit: fetcher.submit }
}
