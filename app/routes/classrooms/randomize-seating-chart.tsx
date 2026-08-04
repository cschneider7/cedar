import { generateRandomSeatingChart } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
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
      await tokenFromRequest(args)
    )
    return { ok: true, seatingChart }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
