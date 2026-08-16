import { useEffect } from "react"
import { toast } from "~/components/ui/toast"
import { useClassroomPatch } from "~/hooks/use-classroom-patch"
import { MAX_PINNED_CLASSROOMS, isAtPinLimit } from "~/lib/classroom-limit"

/**
 * Shared pin/unpin flow for classrooms: submits `pinned_at` via
 * `useClassroomPatch`, and toast-blocks a new pin once the account is
 * already at the pin cap.
 * @returns `setPinned` to toggle a classroom's pin state, plus pending state.
 */
export function usePinClassroom() {
  const { fetcher, submit } = useClassroomPatch()
  const isPending = fetcher.state !== "idle"

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.ok) {
      toast.add({ title: fetcher.data.error, type: "error" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data])

  /**
   * Pins or unpins a classroom.
   * @param classroomId - The classroom's id.
   * @param pinned - True to pin, false to unpin.
   * @param currentPinnedCount - The account's current pinned classroom count,
   * used for the client-side cap check before submitting.
   */
  function setPinned(
    classroomId: string,
    pinned: boolean,
    currentPinnedCount: number
  ) {
    if (pinned && isAtPinLimit(currentPinnedCount, MAX_PINNED_CLASSROOMS)) {
      toast.add({
        title: `You've reached the ${MAX_PINNED_CLASSROOMS} pinned classroom limit.`,
        type: "error",
      })
      return
    }
    submit(classroomId, { pinned_at: pinned ? new Date().toISOString() : null })
  }

  return { setPinned, isPending }
}
