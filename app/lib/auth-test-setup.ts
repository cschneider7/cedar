import { vi } from "vitest"

// Global mock for `~/lib/auth-client`, via vitest's `setupFiles`. Defaults
// to authenticated with a fixed token; override per-test with
// `vi.mocked(getBearerToken).mockResolvedValueOnce(...)` or
// `vi.mocked(authClient.getSession).mockResolvedValueOnce(...)`.
vi.mock("~/lib/auth-client", () => {
  const fakeSession = {
    data: {
      session: { id: "test-session", userId: "test-user" },
      user: { id: "test-user", email: "test@example.com", name: "Test User" },
    },
    error: null,
    isPending: false,
  }

  const getSession = vi.fn(async () => fakeSession)
  const getBearerToken = vi.fn(async () => "test-token")

  return {
    authClient: {
      getSession,
      useSession: vi.fn(() => fakeSession),
      signIn: { email: vi.fn(), social: vi.fn() },
      signUp: { email: vi.fn() },
      signOut: vi.fn(),
    },
    getBearerToken,
  }
})
