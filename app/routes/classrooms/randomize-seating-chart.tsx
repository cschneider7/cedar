import { generateRandomSeatingChart } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import type { SeatingChart } from "~/lib/schemas"
import type { Route } from "./+types/randomize-seating-chart"

export type RandomizeSeatingChartResult =
  { ok: true; seatingChart: SeatingChart } | { ok: false; error: string }

export async function action(
  args: Route.ActionArgs
): Promise<RandomizeSeatingChartResult> {
  const options = await args.request.json()

  try {
    const seatingChart = await generateRandomSeatingChart(
      args.params.classroomId,
      options,
      await getAccessToken(args.context)
    )
    return { ok: true, seatingChart }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
