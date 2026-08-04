import { vi } from "vitest"

// Global mock for `@clerk/react-router/server`, via vitest's `setupFiles`.
// Defaults to authenticated; override per-test with `vi.mocked(getAuth).mockResolvedValueOnce(...)`.
vi.mock("@clerk/react-router/server", () => {
  const getAuth = vi.fn(async () => ({
    isAuthenticated: true,
    getToken: async () => "test-token",
  }))
  // Delegates to the same `getAuth` mock, so overriding it in a specific
  // test also changes what the root loader sees via `request.auth`.
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
