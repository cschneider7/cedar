import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createContext } from "react-router"

export const SUPABASE_AUTH_COOKIE_NAME = "sb-cedar-auth-token"

/**
 * Supabase client + resolved user context for the current request
 */
export const supabaseContext = createContext<{
  client: SupabaseClient
  user: User | null
}>()
