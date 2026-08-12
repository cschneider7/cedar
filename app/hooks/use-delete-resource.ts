import { useEffect } from "react"
import { useFetcher, useLocation, useNavigate } from "react-router"
import { toast } from "~/components/ui/toast"

type DeleteResult = { ok: boolean; error?: string }

type UseDeleteResourceOptions = {
  /** Toast message shown on success. */
  successMessage: string
  /** Extra side effect on success, e.g. closing the dialog or clearing a
   * local selection. */
  onDeleted?: () => void
  /** Navigate here on success, if set. */
  navigateTo?: string
  /**
   * Restrict navigation to when the location matches this prefix (e.g. the
   * resource's own page) — for a dialog usable from multiple contexts.
   */
  onlyIfViewing?: string
}

/**
 * Shared fetcher-backed delete flow: derives pending/error state, and on
 * success shows a toast, runs `onDeleted`, and optionally navigates.
 * @param options - Success messaging/navigation behavior, see
 * `UseDeleteResourceOptions`.
 * @returns Pending/error state plus a `submit` function to trigger the delete.
 */
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
    toast.add({ title: successMessage, type: "success" })
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
