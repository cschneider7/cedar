import { useRouteLoaderData } from "react-router"
import type { clientLoader as classroomLoader } from "~/routes/classrooms/classroom"

export const CLASSROOM_ROUTE_ID = "classroom"

/**
 * Reads the classroom layout route's shared loader data from any of its
 * child tab routes.
 */
export function useClassroomData() {
  const data = useRouteLoaderData<typeof classroomLoader>(CLASSROOM_ROUTE_ID)
  if (!data) {
    throw new Error(
      "useClassroomData must be used within a classroom child route"
    )
  }
  return data
}
