import type { RouterContextProvider } from "react-router"
import { afterEach, beforeEach, vi } from "vitest"
import { createTestContext } from "~/lib/auth-test-setup"

/**
 * Registers the fetch-stub lifecycle every action/loader test file needs.
 */
export function stubFetch() {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
}

/**
 * Builds a fake React Router `Route.{Action,Loader}Args` object.
 * @param url - The request URL.
 * @param options - Method, route params, request body, and headers.
 * @returns A fake `args` object shaped like a loader/action would receive.
 */
export function makeArgs(
  url: string,
  options: {
    method?: string
    params?: Record<string, string>
    body?: unknown
    headers?: Record<string, string>
    context?: RouterContextProvider
  } = {}
) {
  const { method = "GET", params = {}, body, headers, context } = options
  return {
    request: new Request(url, {
      method,
      ...(headers ? { headers } : {}),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    params,
    context: context ?? createTestContext(),
  } as any
}

/**
 * Narrows a clientLoader's result, failing the test if it redirected instead
 * of returning data.
 */
export function expectLoaderData<T>(result: Response | T): T {
  if (result instanceof Response) {
    throw new Error("expected loader data but got a redirect Response")
  }
  return result
}
