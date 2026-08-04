import { vi } from "vitest"

// Global mock for `@clerk/react-router/server`, registered via vitest's
// `setupFiles` so every test file gets it without repeating boilerplate.
// Defaults to "authenticated" — no route test in this repo currently
// exercises the unauthenticated/redirect path, so that's the one scenario
// that would need a per-test override (`vi.mocked(getAuth).mockResolvedValueOnce(...)`).
vi.mock("@clerk/react-router/server", () => {
  const getAuth = vi.fn(async () => ({
    isAuthenticated: true,
    getToken: async () => "test-token",
  }))
  // Delegates to the same `getAuth` mock, so overriding `getAuth` in a
  // specific test (e.g. `vi.mocked(getAuth).mockResolvedValueOnce(...)`)
  // also changes what the root loader sees via `request.auth`.
  const rootAuthLoader = vi.fn(
    async (
      args: { request: Request },
      callback: (args: {
        request: Request & { auth: Awaited<ReturnType<typeof getAuth>> }
      }) => unknown
    ) => {
      const auth = await getAuth()
      return callback({ ...args, request: Object.assign(args.request, { auth }) })
    }
  )
  return { getAuth, rootAuthLoader, clerkMiddleware: vi.fn(() => vi.fn()) }
})
