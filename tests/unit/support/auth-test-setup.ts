import { RouterContextProvider } from "react-router"
import { vi } from "vitest"
import { supabaseContext } from "~/lib/supabase/context"

const FAKE_USER = {
  id: "test-user",
  email: "test@example.com",
} as const

/**
 * Builds a fake `RouterContextProvider` with `supabaseContext` pre-set, for
 * calling a route's `loader`/`action` directly in a test. Defaults to a
 * signed-in user with a fixed access token; pass `null` for a signed-out
 * request, or a custom token for tests asserting on the exact token forwarded
 * to `~/lib/api.ts`.
 */
export function createTestContext(
  user: { id: string; email: string } | null = FAKE_USER,
  token = "test-token"
): RouterContextProvider {
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: user ? { access_token: token } : null },
      })),
      getUser: vi.fn(async () => ({ data: { user } })),
    },
  }
  return new RouterContextProvider(
    new Map([[supabaseContext, { client, user } as never]])
  )
}
