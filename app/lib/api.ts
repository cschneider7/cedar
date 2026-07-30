import * as z from "zod"
import {
  BulkDeleteResultSchema,
  ClassroomSchema,
  ColdCallPickSchema,
  ColdCallSchema,
  CreateClassroomSchema,
  CreateStudentSchema,
  ForgotPasswordSchema,
  LoginSchema,
  RandomizeSeatingChartOptionsSchema,
  ResetPasswordSchema,
  SeatingChartSchema,
  SignupSchema,
  StudentSchema,
  StudentsPageSchema,
  UpdateClassroomSchema,
  UpdateStudentSchema,
  UserSchema,
  type BulkDeleteResult,
  type Classroom,
  type ColdCall,
  type ColdCallPick,
  type RandomizeSeatingChartOptions,
  type SeatingChart,
  type Student,
  type StudentsPage,
  type User,
} from "~/lib/schemas"

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
  return text || fallback
}

/** Same as `getErrorMessage`, but also surfaces the backend's machine-readable
 * `code` (e.g. "unverified", "locked_out") when present, for callers that
 * need to branch on it rather than just display the message. */
async function getErrorDetails(
  res: Response,
  fallback: string
): Promise<{ message: string; code?: string }> {
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    if (typeof json?.message === "string") {
      return {
        message: json.message,
        code: typeof json?.code === "string" ? json.code : undefined,
      }
    }
  } catch {
    // Not JSON - fall through to using the raw text below.
  }
  return { message: text || fallback }
}

/** Server-side (loader/action) callers must forward the incoming request's
 * `Cookie` header explicitly — there's no ambient browser cookie jar during
 * SSR, so `credentials: "include"` alone only covers browser-originated calls. */
function withCookie(cookie?: string): HeadersInit | undefined {
  return cookie ? { Cookie: cookie } : undefined
}

export async function getStudent(
  studentId: string,
  cookie?: string
): Promise<Student> {
  const res = await fetch(
    `http://localhost:3000/api/v1/students/${studentId}`,
    {
      credentials: "include",
      headers: withCookie(cookie),
    }
  )
  if (!res.ok) {
    throw new Response("Student not found", { status: 404 })
  }

  const json = await res.json()
  return z.parse(StudentSchema, json.data)
}

export async function getStudents(cookie?: string): Promise<Student[]> {
  const res = await fetch("http://localhost:3000/api/v1/students", {
    credentials: "include",
    headers: withCookie(cookie),
  })
  if (!res.ok) {
    throw new Error(`Error getting list of students: ", ${res.status}`)
  }

  const json = await res.json()
  return z.parse(z.array(StudentSchema), json.data)
}

export async function getStudentsPage(
  params: {
    page: number
    pageSize: number
    q?: string
    sortBy?: "name" | "student_id" | "classroom"
    sortDir?: "asc" | "desc"
  },
  cookie?: string
): Promise<StudentsPage> {
  const url = new URL("http://localhost:3000/api/v1/students")
  url.searchParams.set("page", String(params.page))
  url.searchParams.set("page_size", String(params.pageSize))
  if (params.q) {
    url.searchParams.set("q", params.q)
  }
  if (params.sortBy) {
    url.searchParams.set("sort_by", params.sortBy)
  }
  if (params.sortDir) {
    url.searchParams.set("sort_dir", params.sortDir)
  }

  const res = await fetch(url, {
    credentials: "include",
    headers: withCookie(cookie),
  })
  if (!res.ok) {
    throw new Error(
      `Error getting paginated list of students: ", ${res.status}`
    )
  }

  const json = await res.json()
  return z.parse(StudentsPageSchema, json.data)
}

export async function createStudent(
  studentInfo: z.infer<typeof CreateStudentSchema>,
  cookie?: string
): Promise<Student> {
  const response = await fetch("http://localhost:3000/api/v1/students", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...withCookie(cookie),
    },
    body: JSON.stringify(z.parse(CreateStudentSchema, studentInfo)),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error creating student"))
  }

  const json = await response.json()
  return z.parse(StudentSchema, json.data)
}

export async function updateStudent(
  studentId: string,
  updates: z.infer<typeof UpdateStudentSchema>,
  cookie?: string
) {
  const response = await fetch(
    `http://localhost:3000/api/v1/students/${studentId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...withCookie(cookie),
      },
      body: JSON.stringify(z.parse(UpdateStudentSchema, updates)),
    }
  )

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error updating student"))
  }
}

export async function deleteStudent(studentId: string, cookie?: string) {
  const response = await fetch(
    `http://localhost:3000/api/v1/students/${studentId}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: withCookie(cookie),
    }
  )

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error deleting student"))
  }
}

export async function bulkDeleteStudents(
  ids: string[],
  cookie?: string
): Promise<BulkDeleteResult> {
  const response = await fetch("http://localhost:3000/api/v1/students", {
    method: "DELETE",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...withCookie(cookie),
    },
    body: JSON.stringify({ ids }),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error deleting students"))
  }

  const json = await response.json()
  return z.parse(BulkDeleteResultSchema, json.data)
}

export async function getClassroom(
  classroomId: string,
  cookie?: string
): Promise<Classroom> {
  const res = await fetch(
    `http://localhost:3000/api/v1/classrooms/${classroomId}`,
    { credentials: "include", headers: withCookie(cookie) }
  )
  if (!res.ok) {
    throw new Response("Classroom not found", { status: 404 })
  }

  const json = await res.json()
  return z.parse(ClassroomSchema, json.data)
}

export async function getClassrooms(cookie?: string): Promise<Classroom[]> {
  const res = await fetch("http://localhost:3000/api/v1/classrooms", {
    credentials: "include",
    headers: withCookie(cookie),
  })
  if (!res.ok) {
    throw new Error(`Error getting list of classrooms: ", ${res.status}`)
  }

  const json = await res.json()
  return z.parse(z.array(ClassroomSchema), json.data)
}

export async function createClassroom(
  classroomInfo: z.infer<typeof CreateClassroomSchema>,
  cookie?: string
): Promise<Classroom> {
  const response = await fetch("http://localhost:3000/api/v1/classrooms", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...withCookie(cookie),
    },
    body: JSON.stringify(z.parse(CreateClassroomSchema, classroomInfo)),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error creating classroom"))
  }

  const json = await response.json()
  return z.parse(ClassroomSchema, json.data)
}

export async function updateClassroom(
  classroomId: string,
  updates: z.infer<typeof UpdateClassroomSchema>,
  cookie?: string
) {
  const response = await fetch(
    `http://localhost:3000/api/v1/classrooms/${classroomId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...withCookie(cookie),
      },
      body: JSON.stringify(z.parse(UpdateClassroomSchema, updates)),
    }
  )

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error updating classroom"))
  }
}

export async function deleteClassroom(classroomId: string, cookie?: string) {
  const response = await fetch(
    `http://localhost:3000/api/v1/classrooms/${classroomId}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: withCookie(cookie),
    }
  )

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error deleting classroom"))
  }
}

export async function getClassroomSeatingChart(
  classroomId: string,
  cookie?: string
): Promise<SeatingChart> {
  const res = await fetch(
    `http://localhost:3000/api/v1/classrooms/${classroomId}/seating-chart`,
    { credentials: "include", headers: withCookie(cookie) }
  )
  if (!res.ok) {
    throw new Error(`Error getting seating chart assignments: ", ${res.status}`)
  }

  const json = await res.json()
  const seatingChart = z.parse(SeatingChartSchema, json.data)

  return seatingChart
}

export async function updateClassroomSeatingChart(
  classroomId: string,
  seatingChart: SeatingChart,
  cookie?: string
) {
  const response = await fetch(
    `http://localhost:3000/api/v1/classrooms/${classroomId}/seating-chart`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...withCookie(cookie),
      },
      body: JSON.stringify(z.parse(SeatingChartSchema, seatingChart)),
    }
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Error updating seating chart")
    )
  }
}

export async function generateRandomSeatingChart(
  classroomId: string,
  options: RandomizeSeatingChartOptions,
  cookie?: string
): Promise<SeatingChart> {
  const response = await fetch(
    `http://localhost:3000/api/v1/classrooms/${classroomId}/seating-chart/randomize`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...withCookie(cookie),
      },
      body: JSON.stringify(
        z.parse(RandomizeSeatingChartOptionsSchema, options)
      ),
    }
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Error generating random seating chart")
    )
  }

  const json = await response.json()
  return z.parse(SeatingChartSchema, json.data)
}

export async function pickColdCallStudent(
  classroomId: string,
  payload: ColdCall,
  cookie?: string
): Promise<ColdCallPick> {
  const response = await fetch(
    `http://localhost:3000/api/v1/classrooms/${classroomId}/cold-call`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...withCookie(cookie),
      },
      body: JSON.stringify(z.parse(ColdCallSchema, payload)),
    }
  )

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error picking a student"))
  }

  const json = await response.json()
  return z.parse(ColdCallPickSchema, json.data)
}

// --- Auth ---

/** Login/signup error shape: a display message plus an optional
 * machine-readable `code` ("unverified", "locked_out") for UI branching. */
export class AuthApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

export async function login(
  credentials: z.infer<typeof LoginSchema>,
  cookie?: string
): Promise<{ user: User; setCookie: string | null }> {
  const response = await fetch("http://localhost:3000/api/v1/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...withCookie(cookie) },
    body: JSON.stringify(z.parse(LoginSchema, credentials)),
  })

  if (!response.ok) {
    const { message, code } = await getErrorDetails(
      response,
      "Error logging in"
    )
    throw new AuthApiError(message, code)
  }

  const json = await response.json()
  return {
    user: z.parse(UserSchema, json.data.user),
    setCookie: response.headers.get("set-cookie"),
  }
}

export async function signup(
  credentials: z.infer<typeof SignupSchema>,
  cookie?: string
): Promise<User> {
  const response = await fetch("http://localhost:3000/api/v1/auth/signup", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...withCookie(cookie) },
    // confirmPassword is client-only validation, never sent to the backend.
    body: JSON.stringify({
      email: z.parse(SignupSchema, credentials).email,
      password: credentials.password,
    }),
  })

  if (!response.ok) {
    const { message, code } = await getErrorDetails(
      response,
      "Error signing up"
    )
    throw new AuthApiError(message, code)
  }

  const json = await response.json()
  return z.parse(UserSchema, json.data.user)
}

export async function resendVerificationEmail(
  email: string,
  cookie?: string
): Promise<void> {
  const response = await fetch(
    "http://localhost:3000/api/v1/auth/resend-verification",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...withCookie(cookie) },
      body: JSON.stringify({ email }),
    }
  )
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Error resending verification email")
    )
  }
}

export async function verifyEmail(
  token: string,
  cookie?: string
): Promise<void> {
  const response = await fetch(
    "http://localhost:3000/api/v1/auth/verify-email",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...withCookie(cookie) },
      body: JSON.stringify({ token }),
    }
  )
  if (!response.ok) {
    const { message, code } = await getErrorDetails(
      response,
      "This verification link is invalid or has expired"
    )
    throw new AuthApiError(message, code)
  }
}

export async function forgotPassword(
  email: string,
  cookie?: string
): Promise<void> {
  const response = await fetch(
    "http://localhost:3000/api/v1/auth/forgot-password",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...withCookie(cookie) },
      body: JSON.stringify({ email }),
    }
  )
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Error requesting a password reset")
    )
  }
}

export async function resetPassword(
  input: { token: string; password: string },
  cookie?: string
): Promise<void> {
  const response = await fetch(
    "http://localhost:3000/api/v1/auth/reset-password",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...withCookie(cookie) },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) {
    const { message, code } = await getErrorDetails(
      response,
      "This reset link is invalid or has expired"
    )
    throw new AuthApiError(message, code)
  }
}

export async function logout(
  cookie?: string
): Promise<{ setCookie: string | null }> {
  const response = await fetch("http://localhost:3000/api/v1/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: withCookie(cookie),
  })
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error logging out"))
  }
  return { setCookie: response.headers.get("set-cookie") }
}

export async function getCurrentUser(cookie?: string): Promise<User | null> {
  const response = await fetch("http://localhost:3000/api/v1/auth/me", {
    credentials: "include",
    headers: withCookie(cookie),
  })
  if (!response.ok) {
    return null
  }
  const json = await response.json()
  return z.parse(UserSchema, json.data.user)
}
