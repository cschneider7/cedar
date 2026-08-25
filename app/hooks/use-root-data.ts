import { useCallback, useEffect, useState } from "react"
import { getClassrooms, getStudentLimitStatus } from "~/lib/api"
import { authClient, getAuthToken } from "~/lib/auth-client"
import type { Classroom } from "~/lib/schemas"

export type RootDataFields = {
  classrooms: Classroom[]
  classroomsError: boolean
  studentCount: number | null
  studentLimit: number | null
}

type RootData = RootDataFields & {
  isRefetching: boolean
  refetch: () => void
}

export const EMPTY_ROOT_DATA: RootDataFields = {
  classrooms: [],
  classroomsError: false,
  studentCount: null,
  studentLimit: null,
}

/**
 * Fetches the classroom list and student-limit status, degrading to empty
 * defaults + `classroomsError: true` on any failure — extracted from
 * `useRootData` as a plain function so it's unit-testable without rendering
 * a hook (this project's test suite covers pure loader-shaped logic, not
 * component/hook rendering).
 * @param token - The caller's session token.
 * @returns The signed-in user's classrooms and student-limit status.
 */
export async function fetchRootData(
  token: string | undefined
): Promise<RootDataFields> {
  try {
    const [classrooms, limitStatus] = await Promise.all([
      getClassrooms(token),
      getStudentLimitStatus(token),
    ])
    return {
      classrooms,
      classroomsError: false,
      studentCount: limitStatus.count,
      studentLimit: limitStatus.limit,
    }
  } catch {
    return {
      classrooms: [],
      classroomsError: true,
      studentCount: null,
      studentLimit: null,
    }
  }
}

/**
 * Client-side replacement for `root.tsx`'s old server `loader` — Neon Auth
 * has no server-side session SDK, so this classroom/student-limit prefetch
 * now happens post-hydration once a session is confirmed, instead of at SSR
 * time. `app-topbar.tsx`/`topbar-search.tsx`/`app-sidebar.tsx` read this
 * instead of `useRouteLoaderData("root")`; `refetch` replaces the old
 * `useRevalidator()`-driven retry button, since this data no longer flows
 * through React Router's own loader/revalidation system.
 * @returns The signed-in user's classrooms and student-limit status, or
 * empty defaults while signed out or loading, plus a manual `refetch`.
 */
export function useRootData(): RootData {
  const session = authClient.useSession()
  const [data, setData] = useState(EMPTY_ROOT_DATA)
  const [isRefetching, setIsRefetching] = useState(false)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    if (!session.data) {
      setData(EMPTY_ROOT_DATA)
      return
    }

    let cancelled = false
    setIsRefetching(true)
    ;(async () => {
      const token = await getAuthToken()
      const result = await fetchRootData(token)
      if (!cancelled) {
        setData(result)
        setIsRefetching(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session.data, refetchToken])

  const refetch = useCallback(() => setRefetchToken((n) => n + 1), [])

  return { ...data, isRefetching, refetch }
}
