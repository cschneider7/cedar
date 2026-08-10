import * as z from "zod"
import { MAX_TABLE_DIMENSION } from "~/lib/seating-chart-utils"

export const CreateStudentSchema = z.object({
  classroom_id: z.uuidv4().nullable(),
  student_id: z.coerce.number<number>().int().positive(),
  name: z
    .string()
    .trim()
    .min(1, "Name must be at least 1 character.")
    .max(100, "Name must be at most 100 characters."),
  // Nullish (not just nullable): image_url isn't a react-hook-form-registered
  // field — StudentPhotoField's staged/removed state lives outside the form
  // and is merged into the submit payload by hand in onSubmit — so the
  // zodResolver-validated RHF values never contain this key at all.
  // A plain string, not z.url(): this holds an S3 object key, not a URL.
  image_url: z.string().min(1).nullish(),
})

export const StudentSchema = CreateStudentSchema.extend({
  id: z.string().min(1),
  classroom_id: z.string().min(1).nullable(),
})
export type Student = z.infer<typeof StudentSchema>

export const StudentsPageSchema = z.object({
  students: z.array(StudentSchema),
  page: z.int().positive(),
  page_size: z.int().positive(),
  total_count: z.int().nonnegative(),
  total_pages: z.int().positive(),
})
export type StudentsPage = z.infer<typeof StudentsPageSchema>

export const BulkDeleteResultSchema = z.object({
  deleted_count: z.int().nonnegative(),
})
export type BulkDeleteResult = z.infer<typeof BulkDeleteResultSchema>

export const UpdateStudentSchema = z.object({
  classroom_id: z.uuidv4().nullish(),
  student_id: z.optional(
    z.coerce
      .number<number>("ID must be a number.")
      .int()
      .positive("ID must be a positive number.")
  ),
  name: z.optional(
    z
      .string()
      .trim()
      .min(1, "Name must be at least 1 character.")
      .max(100, "Name must be at most 100 characters.")
  ),
  image_url: z.string().min(1).nullish(),
})

export const CreateClassroomSchema = z.object({
  period: z.coerce.number<number>().int().positive(),
  subject: z
    .string()
    .trim()
    .min(1, "Subject must be at least 1 character.")
    .max(50, "Subject must be at most 50 characters."),
})

export const ClassroomSchema = CreateClassroomSchema.extend({
  id: z.string().min(1),
  boundary_width: z.int(),
  boundary_height: z.int(),
})
export type Classroom = z.infer<typeof ClassroomSchema>

export const UpdateClassroomSchema = z.object({
  period: z.optional(z.coerce.number<number>().int().positive()),
  subject: z.optional(
    z
      .string()
      .trim()
      .min(1, "Subject must be at least 1 character.")
      .max(50, "Subject must be at most 50 characters.")
  ),
  boundary_width: z.optional(z.int().positive()),
  boundary_height: z.optional(z.int().positive()),
})

export const SeatingChartSchema = z.object({
  boundary_width: z.int().positive(),
  boundary_height: z.int().positive(),
  tables: z.array(
    z.object({
      table_number: z.int(),
      rows: z.int().positive().max(MAX_TABLE_DIMENSION),
      cols: z.int().positive().max(MAX_TABLE_DIMENSION),
      x_pos: z.int(),
      y_pos: z.int(),
      seat_assignments: z.array(z.string().min(1).nullable()),
    })
  ),
})
export type SeatingChart = z.infer<typeof SeatingChartSchema>

export const RandomizeSeatingChartOptionsSchema = z.object({
  keep_existing_tables: z.boolean(),
  new_table_rows: z.int().positive().max(MAX_TABLE_DIMENSION),
  new_table_cols: z.int().positive().max(MAX_TABLE_DIMENSION),
  existing_tables: z.array(
    z.object({
      rows: z.int().positive().max(MAX_TABLE_DIMENSION),
      cols: z.int().positive().max(MAX_TABLE_DIMENSION),
      x_pos: z.int(),
      y_pos: z.int(),
    })
  ),
  boundary_width: z.int().positive(),
  boundary_height: z.int().positive(),
})
export type RandomizeSeatingChartOptions = z.infer<
  typeof RandomizeSeatingChartOptionsSchema
>

export const ColdCallCandidateSchema = z.object({
  student_id: z.string().min(1), // the student's `id` (UUID), not the numeric roster student_id
  weight: z.int(),
})

export const ColdCallSchema = z.object({
  students: z.array(ColdCallCandidateSchema),
})
export type ColdCall = z.infer<typeof ColdCallSchema>

export const ColdCallPickSchema = z.object({
  picked_student_id: z.string().min(1),
  students: z.array(ColdCallCandidateSchema),
})
export type ColdCallPick = z.infer<typeof ColdCallPickSchema>
