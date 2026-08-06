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

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1"

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

/** Attaches the Clerk session token as a bearer `Authorization` header.
 * Both SSR (loader/action) and browser-originated calls go through this —
 * there's no ambient credential (unlike a cookie jar), so every caller must
 * pass its own token explicitly. */
function withAuth(token?: string | null): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

export async function getStudent(
  studentId: string,
  token?: string | null
): Promise<Student> {
  const res = await fetch(`${API_URL}/students/${studentId}`, {
    headers: withAuth(token),
  })
  if (!res.ok) {
    throw new Response("Student not found", { status: 404 })
  }

  const json = await res.json()
  return z.parse(StudentSchema, json.data)
}

export async function getStudents(token?: string | null): Promise<Student[]> {
  const res = await fetch(`${API_URL}/students`, {
    headers: withAuth(token),
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
  token?: string | null
): Promise<StudentsPage> {
  const url = new URL(`${API_URL}/students`)
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
    headers: withAuth(token),
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
  token?: string | null
): Promise<Student> {
  const response = await fetch(`${API_URL}/students`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
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
  token?: string | null
) {
  const response = await fetch(`${API_URL}/students/${studentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(z.parse(UpdateStudentSchema, updates)),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error updating student"))
  }
}

export async function deleteStudent(studentId: string, token?: string | null) {
  const response = await fetch(`${API_URL}/students/${studentId}`, {
    method: "DELETE",
    headers: withAuth(token),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error deleting student"))
  }
}

export async function bulkDeleteStudents(
  ids: string[],
  token?: string | null
): Promise<BulkDeleteResult> {
  const response = await fetch(`${API_URL}/students`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
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
  token?: string | null
): Promise<Classroom> {
  const res = await fetch(`${API_URL}/classrooms/${classroomId}`, {
    headers: withAuth(token),
  })
  if (!res.ok) {
    throw new Response("Classroom not found", { status: 404 })
  }

  const json = await res.json()
  return z.parse(ClassroomSchema, json.data)
}

export async function getClassrooms(
  token?: string | null
): Promise<Classroom[]> {
  const res = await fetch(`${API_URL}/classrooms`, {
    headers: withAuth(token),
  })
  if (!res.ok) {
    throw new Error(`Error getting list of classrooms: ", ${res.status}`)
  }

  const json = await res.json()
  return z.parse(z.array(ClassroomSchema), json.data)
}

export async function createClassroom(
  classroomInfo: z.infer<typeof CreateClassroomSchema>,
  token?: string | null
): Promise<Classroom> {
  const response = await fetch(`${API_URL}/classrooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
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
  token?: string | null
) {
  const response = await fetch(`${API_URL}/classrooms/${classroomId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token),
    },
    body: JSON.stringify(z.parse(UpdateClassroomSchema, updates)),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error updating classroom"))
  }
}

export async function deleteClassroom(
  classroomId: string,
  token?: string | null
) {
  const response = await fetch(`${API_URL}/classrooms/${classroomId}`, {
    method: "DELETE",
    headers: withAuth(token),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Error deleting classroom"))
  }
}

export async function getClassroomSeatingChart(
  classroomId: string,
  token?: string | null
): Promise<SeatingChart> {
  const res = await fetch(
    `${API_URL}/classrooms/${classroomId}/seating-chart`,
    { headers: withAuth(token) }
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
  token?: string | null
) {
  const response = await fetch(
    `${API_URL}/classrooms/${classroomId}/seating-chart`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...withAuth(token),
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
  token?: string | null
): Promise<SeatingChart> {
  const response = await fetch(
    `${API_URL}/classrooms/${classroomId}/seating-chart/randomize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...withAuth(token),
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
  token?: string | null
): Promise<ColdCallPick> {
  const response = await fetch(
    `${API_URL}/classrooms/${classroomId}/cold-call`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...withAuth(token),
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
