import { generateRandomSeatingChart } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import type { SeatingChart } from "~/lib/schemas"
import type { Route } from "./+types/randomize-seating-chart"

export type RandomizeSeatingChartResult =
  { ok: true; seatingChart: SeatingChart } | { ok: false; error: string }

export async function action({
  params,
  request,
}: Route.ActionArgs): Promise<RandomizeSeatingChartResult> {
  const options = await request.json()

  try {
    const seatingChart = await generateRandomSeatingChart(
      params.classroomId,
      options,
      cookieFromRequest(request)
    )
    return { ok: true, seatingChart }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
