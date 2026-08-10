import * as z from "zod"
import {
  BulkDeleteResultSchema,
  ClassroomSchema,
  ColdCallPickSchema,
  ColdCallSchema,
  CreateClassroomSchema,
  CreateStudentSchema,
  RandomizeSeatingChartOptionsSchema,
  SeatingChartSchema,
  StudentSchema,
  StudentsPageSchema,
  UpdateClassroomSchema,
  UpdateStudentSchema,
  type BulkDeleteResult,
  type Classroom,
  type ColdCall,
  type ColdCallPick,
  type RandomizeSeatingChartOptions,
  type SeatingChart,
  type Student,
  type StudentsPage,
} from "~/lib/schemas"

const API_URL = import.meta.env.VITE_API_URL
if (!API_URL) {
  throw new Error("VITE_API_URL is not set")
}

/** A failed API call, distinguishing a real HTTP error status from a
 * network-level failure (offline, DNS, CORS) or an unparseable response —
 * `status` is 0 for the latter two, never a guessed/fake HTTP status. */
export class ApiError extends Error {
  status: number
  kind: "http" | "network" | "parse"

  constructor(message: string, status: number, kind: "http" | "network" | "parse") {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.kind = kind
  }
}

/** Re-throws an `ApiError` as a route `Response` carrying its real status,
 * for loaders that let failures propagate to the nearest `ErrorBoundary`.
 * The message is set as `statusText` (not just the body) since that's what
 * `root.tsx`/`route-error-card.tsx` read via `isRouteErrorResponse`.
 * Anything else (a bug, not an API failure) is rethrown as-is. */
export function toRouteError(error: unknown): never {
  if (error instanceof ApiError) {
    // statusText must be a valid HTTP reason phrase (no CR/LF); sanitize
    // rather than let an unusual backend message throw while constructing
    // this very error response.
    const statusText = error.message.replace(/[\r\n]+/g, " ").slice(0, 200)
    throw new Response(error.message, {
      status: error.status || 503,
      statusText,
    })
  }
  throw error
}

async function getErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    if (typeof json?.message === "string") {
      return json.message
    }
  } catch {
    // Not JSON - fall through to using the raw text below.
  }
  // A non-JSON body that looks like an HTML error page (e.g. from a proxy
  // or load balancer) shouldn't be rendered verbatim inside a UI alert.
  if (text.trim().startsWith("<")) {
    return fallback
  }
  return text || fallback
}

/** Attaches the Clerk session token as a bearer `Authorization` header.
 * Both SSR (loader/action) and browser-originated calls go through this —
 * there's no ambient credential (unlike a cookie jar), so every caller must
 * pass its own token explicitly. */
function withAuth(token?: string | null): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

type ApiFetchOptions = {
  method?: string
  token?: string | null
  body?: unknown
  signal?: AbortSignal
}

/** Shared low-level fetch wrapper for every function in this file: builds
 * the request, never lets a raw network failure escape unguarded, preserves
 * the real HTTP status on failure (see `ApiError`), and validates the
 * response envelope's `data` against `schema`. Pass `undefined` for `schema`
 * for endpoints whose success body isn't consumed (e.g. delete/update). */
async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T> | undefined,
  opts: ApiFetchOptions = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined
          ? { "Content-Type": "application/json" }
          : undefined),
        ...withAuth(opts.token),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })
  } catch {
    throw new ApiError(
      "Network error — check your connection and try again.",
      0,
      "network"
    )
  }

  if (!res.ok) {
    throw new ApiError(
      await getErrorMessage(res, `Request failed (${res.status})`),
      res.status,
      "http"
    )
  }

  if (!schema) {
    return undefined as T
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new ApiError("Unexpected response from server.", res.status, "parse")
  }

  const parsed = z.safeParse(schema, (json as { data?: unknown })?.data ?? json)
  if (!parsed.success) {
    throw new ApiError(
      "Received unexpected data from server.",
      res.status,
      "parse"
    )
  }
  return parsed.data
}

export async function getStudent(
  studentId: string,
  token?: string | null
): Promise<Student> {
  return apiFetch(`/students/${studentId}`, StudentSchema, { token })
}

export async function getStudents(token?: string | null): Promise<Student[]> {
  return apiFetch(`/students`, z.array(StudentSchema), { token })
}

export async function getStudentsPage(
  params: {
    page: number
    pageSize: number
    q?: string
    sortBy?: "name" | "student_id" | "classroom"
    sortDir?: "asc" | "desc"
  },
  token?: string | null
): Promise<StudentsPage> {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
  })
  if (params.q) {
    searchParams.set("q", params.q)
  }
  if (params.sortBy) {
    searchParams.set("sort_by", params.sortBy)
  }
  if (params.sortDir) {
    searchParams.set("sort_dir", params.sortDir)
  }

  return apiFetch(`/students?${searchParams}`, StudentsPageSchema, { token })
}

export async function createStudent(
  studentInfo: z.infer<typeof CreateStudentSchema>,
  token?: string | null
): Promise<Student> {
  return apiFetch(`/students`, StudentSchema, {
    method: "POST",
    token,
    body: z.parse(CreateStudentSchema, studentInfo),
  })
}

export async function updateStudent(
  studentId: string,
  updates: z.infer<typeof UpdateStudentSchema>,
  token?: string | null
) {
  await apiFetch(`/students/${studentId}`, undefined, {
    method: "PATCH",
    token,
    body: z.parse(UpdateStudentSchema, updates),
  })
}

export async function deleteStudent(studentId: string, token?: string | null) {
  await apiFetch(`/students/${studentId}`, undefined, {
    method: "DELETE",
    token,
  })
}

export async function bulkDeleteStudents(
  ids: string[],
  token?: string | null
): Promise<BulkDeleteResult> {
  return apiFetch(`/students`, BulkDeleteResultSchema, {
    method: "DELETE",
    token,
    body: { ids },
  })
}

export async function getClassroom(
  classroomId: string,
  token?: string | null
): Promise<Classroom> {
  return apiFetch(`/classrooms/${classroomId}`, ClassroomSchema, { token })
}

export async function getClassrooms(
  token?: string | null
): Promise<Classroom[]> {
  return apiFetch(`/classrooms`, z.array(ClassroomSchema), { token })
}

export async function createClassroom(
  classroomInfo: z.infer<typeof CreateClassroomSchema>,
  token?: string | null
): Promise<Classroom> {
  return apiFetch(`/classrooms`, ClassroomSchema, {
    method: "POST",
    token,
    body: z.parse(CreateClassroomSchema, classroomInfo),
  })
}

export async function updateClassroom(
  classroomId: string,
  updates: z.infer<typeof UpdateClassroomSchema>,
  token?: string | null
) {
  await apiFetch(`/classrooms/${classroomId}`, undefined, {
    method: "PATCH",
    token,
    body: z.parse(UpdateClassroomSchema, updates),
  })
}

export async function deleteClassroom(
  classroomId: string,
  token?: string | null
) {
  await apiFetch(`/classrooms/${classroomId}`, undefined, {
    method: "DELETE",
    token,
  })
}

export async function getClassroomSeatingChart(
  classroomId: string,
  token?: string | null
): Promise<SeatingChart> {
  return apiFetch(
    `/classrooms/${classroomId}/seating-chart`,
    SeatingChartSchema,
    { token }
  )
}

export async function updateClassroomSeatingChart(
  classroomId: string,
  seatingChart: SeatingChart,
  token?: string | null
) {
  await apiFetch(`/classrooms/${classroomId}/seating-chart`, undefined, {
    method: "PUT",
    token,
    body: z.parse(SeatingChartSchema, seatingChart),
  })
}

export async function generateRandomSeatingChart(
  classroomId: string,
  options: RandomizeSeatingChartOptions,
  token?: string | null
): Promise<SeatingChart> {
  return apiFetch(
    `/classrooms/${classroomId}/seating-chart/randomize`,
    SeatingChartSchema,
    {
      method: "POST",
      token,
      body: z.parse(RandomizeSeatingChartOptionsSchema, options),
    }
  )
}

export async function pickColdCallStudent(
  classroomId: string,
  payload: ColdCall,
  token?: string | null
): Promise<ColdCallPick> {
  return apiFetch(`/classrooms/${classroomId}/cold-call`, ColdCallPickSchema, {
    method: "POST",
    token,
    body: z.parse(ColdCallSchema, payload),
  })
}
