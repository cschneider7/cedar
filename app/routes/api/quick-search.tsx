import { getStudentsPage } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import type { Route } from "./+types/quick-search"

/**
 * Looks up students matching a search query.
 * @param args - The loader args, carrying the request's `q` search param.
 * @returns The matching students, or an empty list if `q` is missing or the lookup fails.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const token = await getAccessToken(context)
  const q = new URL(request.url).searchParams.get("q")?.trim()
  if (!q) return { students: [] }

  try {
    const { students } = await getStudentsPage(
      { page: 1, pageSize: 5, q },
      token
    )
    return { students }
  } catch {
    return { students: [] }
  }
}
