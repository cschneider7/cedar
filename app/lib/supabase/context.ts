import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createContext } from "react-router"

/**
 * Explicit, stable auth-cookie name shared by the browser and server
 * clients. Supabase's default cookie name is otherwise derived from the
 * project URL's hostname — pinning it avoids a mismatch if the browser and
 * server ever resolve the Supabase URL differently.
 */
export const SUPABASE_AUTH_COOKIE_NAME = "sb-cedar-auth-token"

/**
 * Per-request Supabase client + resolved user, set once by the root
 * `supabaseSessionMiddleware` and read by every downstream loader/action/
 * middleware via `context.get(supabaseContext)`.
 */
export const supabaseContext = createContext<{
  client: SupabaseClient
  user: User | null
}>()
