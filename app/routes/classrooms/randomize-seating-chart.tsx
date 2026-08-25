import { generateRandomSeatingChart } from "~/lib/api"
import { getAuthToken } from "~/lib/auth-client"
import type { SeatingChart } from "~/lib/schemas"
import type { Route } from "./+types/randomize-seating-chart"

export type RandomizeSeatingChartResult =
  { ok: true; seatingChart: SeatingChart } | { ok: false; error: string }

export async function clientAction(
  args: Route.ClientActionArgs
): Promise<RandomizeSeatingChartResult> {
  const options = await args.request.json()

  try {
    const seatingChart = await generateRandomSeatingChart(
      args.params.classroomId,
      options,
      await getAuthToken()
    )
    return { ok: true, seatingChart }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
