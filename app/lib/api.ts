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

/**
 * A failed API call — `kind` distinguishes a real HTTP error from a
 * network/parse failure; `status` is 0 for the latter two.
 */
export class ApiError extends Error {
  status: number
  kind: "http" | "network" | "parse"

  constructor(
    message: string,
    status: number,
    kind: "http" | "network" | "parse"
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.kind = kind
  }
}

/**
 * Re-throws an `ApiError` as a route `Response` carrying its real status,
 * for loaders that let failures propagate to the nearest `ErrorBoundary`.
 * @param error - The caught value to convert.
 */
export function toRouteError(error: unknown): never {
  if (error instanceof ApiError) {
    // statusText must be a valid HTTP reason phrase (no CR/LF) — sanitize so
    // an unusual backend message can't throw while building this response.
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

/**
 * Attaches the Clerk session token as a bearer `Authorization` header —
 * every caller passes its own token; there's no ambient shared credential.
 * @param token - The session token, if any.
 * @returns Headers with the bearer token, or `undefined` if no token.
 */
function withAuth(token?: string | null): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

type ApiFetchOptions = {
  method?: string
  token?: string | null
  body?: unknown
  signal?: AbortSignal
}

/**
 * Shared low-level fetch wrapper for every function below — builds the
 * request, maps failures to `ApiError`, and validates the response against `schema`.
 * @param path - The API path, appended to `API_URL`.
 * @param schema - Schema to validate/parse the response body against, or
 * `undefined` for an endpoint with no response body.
 * @param opts - Method, auth token, request body, and abort signal.
 * @returns The parsed response body, or `undefined` if `schema` is omitted.
 */
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

/**
 * Fetches a single student by id.
 * @param studentId - The student's public-facing UUID.
 * @param token - The caller's session token, if any.
 * @returns The matching student.
 */
export async function getStudent(
  studentId: string,
  token?: string | null
): Promise<Student> {
  return apiFetch(`/students/${studentId}`, StudentSchema, { token })
}

/**
 * Fetches every student.
 * @param token - The caller's session token, if any.
 * @returns All students.
 */
export async function getStudents(token?: string | null): Promise<Student[]> {
  return apiFetch(`/students`, z.array(StudentSchema), { token })
}

/**
 * Fetches a paginated, searchable, sortable page of students.
 * @param params - Page number/size, optional search query, and optional sort.
 * @param token - The caller's session token, if any.
 * @returns The matching page of students, plus paging metadata.
 */
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

/**
 * Creates a new student.
 * @param studentInfo - The new student's fields.
 * @param token - The caller's session token, if any.
 * @returns The created student.
 */
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

/**
 * Partially updates a student.
 * @param studentId - The student's public-facing UUID.
 * @param updates - The fields to change.
 * @param token - The caller's session token, if any.
 */
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

/**
 * Deletes a student.
 * @param studentId - The student's public-facing UUID.
 * @param token - The caller's session token, if any.
 */
export async function deleteStudent(studentId: string, token?: string | null) {
  await apiFetch(`/students/${studentId}`, undefined, {
    method: "DELETE",
    token,
  })
}

/**
 * Deletes multiple students by id.
 * @param ids - The public-facing UUIDs of the students to delete.
 * @param token - The caller's session token, if any.
 * @returns A count of how many students were deleted.
 */
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

/**
 * Fetches a single classroom by id.
 * @param classroomId - The classroom's public-facing UUID.
 * @param token - The caller's session token, if any.
 * @returns The matching classroom.
 */
export async function getClassroom(
  classroomId: string,
  token?: string | null
): Promise<Classroom> {
  return apiFetch(`/classrooms/${classroomId}`, ClassroomSchema, { token })
}

/**
 * Fetches every classroom.
 * @param token - The caller's session token, if any.
 * @returns All classrooms.
 */
export async function getClassrooms(
  token?: string | null
): Promise<Classroom[]> {
  return apiFetch(`/classrooms`, z.array(ClassroomSchema), { token })
}

/**
 * Creates a new classroom.
 * @param classroomInfo - The new classroom's fields.
 * @param token - The caller's session token, if any.
 * @returns The created classroom.
 */
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

/**
 * Partially updates a classroom.
 * @param classroomId - The classroom's public-facing UUID.
 * @param updates - The fields to change.
 * @param token - The caller's session token, if any.
 */
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

/**
 * Deletes a classroom.
 * @param classroomId - The classroom's public-facing UUID.
 * @param token - The caller's session token, if any.
 */
export async function deleteClassroom(
  classroomId: string,
  token?: string | null
) {
  await apiFetch(`/classrooms/${classroomId}`, undefined, {
    method: "DELETE",
    token,
  })
}

/**
 * Fetches a classroom's seating chart (tables, seats, boundary).
 * @param classroomId - The classroom's public-facing UUID.
 * @param token - The caller's session token, if any.
 * @returns The classroom's current seating chart.
 */
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

/**
 * Replaces a classroom's entire seating chart.
 * @param classroomId - The classroom's public-facing UUID.
 * @param seatingChart - The full chart (boundary + tables + seats) to persist.
 * @param token - The caller's session token, if any.
 */
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

/**
 * Proposes a randomized seating chart without persisting it.
 * @param classroomId - The classroom's public-facing UUID.
 * @param options - The current (possibly unsaved) boundary/table geometry to
 * randomize students into.
 * @param token - The caller's session token, if any.
 * @returns A proposed seating chart, not yet saved.
 */
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

/**
 * Picks a weighted-random student for cold call.
 * @param classroomId - The classroom's public-facing UUID.
 * @param payload - Weighting options for the pick.
 * @param token - The caller's session token, if any.
 * @returns The picked student.
 */
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
