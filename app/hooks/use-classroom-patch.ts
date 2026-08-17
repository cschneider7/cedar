import { useFetcher } from "react-router"
import type { MutationResult } from "~/lib/action-results"

/**
 * Submits a partial classroom update through the existing
 * `/classrooms/{id}/edit` action — there's no dedicated field-patch route,
 * so every classroom PATCH (form edits, pin/unpin, sidebar reorder) goes
 * through this same fetcher-submit shape. Shared so callers needing their
 * own independent in-flight request (e.g. two simultaneous writes) can each
 * get their own fetcher via a separate hook call.
 * @returns The underlying fetcher (for state/data) and `submit` to send a
 * partial update.
 */
export function useClassroomPatch() {
  const fetcher = useFetcher<MutationResult>()

  function submit(classroomId: string, fields: Record<string, unknown>) {
    fetcher.submit(fields as never, {
      method: "post",
      action: `/classrooms/${classroomId}/edit`,
      encType: "application/json",
    })
  }

  return { fetcher, submit }
}
