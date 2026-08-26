import { useCallback, useEffect, useState } from "react"
import { useRouteLoaderData } from "react-router"
import { getClassrooms, getStudentLimitStatus } from "~/lib/api"
import type { Classroom } from "~/lib/schemas"
import { getAccessTokenBrowser } from "~/lib/supabase/client"
import type { loader as rootLoader } from "~/root"

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
 * Fetches the classroom list and student-limit status
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
 * Client-side data loader
 * @returns The user's classrooms and student-limit status, or empty defaults while signed out
 */
export function useRootData(): RootData {
  const rootData = useRouteLoaderData<typeof rootLoader>("root")
  const isSignedIn = rootData?.isSignedIn ?? false
  const [data, setData] = useState(EMPTY_ROOT_DATA)
  const [isRefetching, setIsRefetching] = useState(false)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    if (!isSignedIn) {
      setData(EMPTY_ROOT_DATA)
      return
    }

    let cancelled = false
    setIsRefetching(true)
    ;(async () => {
      const token = await getAccessTokenBrowser()
      const result = await fetchRootData(token)
      if (!cancelled) {
        setData(result)
        setIsRefetching(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isSignedIn, refetchToken])

  const refetch = useCallback(() => setRefetchToken((n) => n + 1), [])

  return { ...data, isRefetching, refetch }
}
