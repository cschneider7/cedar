import type { RouterContextProvider } from "react-router"
import { afterEach, beforeEach, vi } from "vitest"
import { createTestContext } from "./auth-test-setup"

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

type LoaderPayload<R> = R extends Response
  ? never
  : R extends { data: infer D; init: ResponseInit | null }
    ? D
    : R

/**
 * Narrows a loader's result to its data payload, failing the test if it
 * redirected instead. Unwraps a `data(payload, init)` return (React Router's
 * `DataWithResponseInit`) so callers see the same payload the route component
 * would.
 */
export function expectLoaderData<R>(result: R): LoaderPayload<R> {
  if (result instanceof Response) {
    throw new Error("expected loader data but got a redirect Response")
  }
  if (
    result &&
    typeof result === "object" &&
    "data" in result &&
    "init" in result
  ) {
    return (result as { data: LoaderPayload<R> }).data
  }
  return result as LoaderPayload<R>
}
