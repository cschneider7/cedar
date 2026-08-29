import type pg from "pg"

import { pool } from "./db.ts"

/**
 * Per-worker test accounts + per-test canonical data, all keyed on a user index
 * so `fullyParallel` workers never collide.
 */

export const E2E_USER_PASSWORD = "e2e-password-1"

const pad = (n: number, width: number) => String(n).padStart(width, "0")

/** `auth.users.id` (also the `user_id` TEXT on every app row) for pool user `i`. */
export function poolUserId(i: number): string {
  return `e2e00000-0000-4000-a000-0000000000${pad(i, 2)}`
}

export function poolUserEmail(i: number): string {
  return `e2e-user-${i}@example.com`
}

export function poolUserCredentials(i: number): {
  email: string
  password: string
} {
  return { email: poolUserEmail(i), password: E2E_USER_PASSWORD }
}

/**
 * Deterministic ids for the canonical fixture set of pool user `i`
 */
export function ids(i: number) {
  const classroom = (prefix: string) =>
    `${prefix}0000000-0000-4000-a000-${pad(i, 12)}`
  return {
    userId: poolUserId(i),
    classroomA: classroom("a"),
    classroomB: classroom("b"),
    classroomC: classroom("c"),
    /** Student UUID from its integer roster number. */
    student: (sid: number) =>
      `5${pad(i, 2)}00000-0000-4000-a000-${pad(sid, 12)}`,
  }
}

/**
 * Roster numbers used by the canonical fixture set
 */
export const ROSTER_A_SIDS = Array.from({ length: 24 }, (_, k) => k + 1)
export const ROSTER_C_SIDS = [101, 102, 103, 104]
export const UNASSIGNED_SID = 999

type Queryable = Pick<pg.PoolClient, "query"> | Pick<pg.Client, "query">

/**
 * Insert the `e2e-user-0..size-1` pool into `auth.users` + `auth.identities`,
 * idempotently. Mirrors the `devtest` block in `supabase/seed.sql`.
 */
export async function provisionAuthPool(
  client: Queryable,
  size: number
): Promise<void> {
  for (let i = 0; i < size; i++) {
    const id = poolUserId(i)
    const email = poolUserEmail(i)
    await client.query(
      `insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data
       ) values (
         '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
         $2, crypt($3, gen_salt('bf')), now(), now(), now(),
         '', '', '', '', '{"provider":"email","providers":["email"]}', '{}'
       ) on conflict (id) do nothing`,
      [id, email, E2E_USER_PASSWORD]
    )
    await client.query(
      `insert into auth.identities (
         id, provider_id, user_id, identity_data, provider, created_at, updated_at
       ) values (
         $1::uuid, $1::text, $1::uuid,
         jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', now(), now()
       ) on conflict (provider_id, provider) do nothing`,
      [id, email]
    )
  }
}

/**
 * Delete every row owned by pool user `i` in FK-safe order. Never touches other
 * users (the `devtest` seed included) because every filter is `user_id`-scoped.
 */
export async function deleteUserData(i: number): Promise<void> {
  const uid = poolUserId(i)
  const client = await pool.connect()
  try {
    await client.query("begin")
    // storage.objects has a delete-protection trigger; bypass it just for this
    // one statement, then restore enforcement before the cascading app deletes.
    await client.query("set local session_replication_role = replica")
    await client.query(
      `delete from storage.objects where bucket_id = 'students' and name like 'students/' || $1 || '/%'`,
      [uid]
    )
    await client.query("set local session_replication_role = default")
    await client.query(`delete from student_separations where user_id = $1`, [
      uid,
    ])
    await client.query(`delete from classrooms where user_id = $1`, [uid]) // cascade -> tables -> seats
    await client.query(`delete from students where user_id = $1`, [uid])
    await client.query("commit")
  } catch (err) {
    await client.query("rollback")
    throw err
  } finally {
    client.release()
  }
}

/**
 * Recreate the canonical fixture set for pool user `i`. Call after
 * {@link deleteUserData}. One transaction.
 *
 * - Classroom A "Homeroom" (pinned), 24 students (sid 1..24), separation sid 1<->2
 * - Classroom B "Study Hall", empty
 * - Classroom C "Lab", 4 students (sid 101..104), a saved 2-table chart
 * - 1 unassigned student (sid 999)
 */
export async function reseedUser(i: number): Promise<void> {
  const uid = poolUserId(i)
  const d = ids(i)
  const client = await pool.connect()
  try {
    await client.query("begin")

    await client.query(
      `insert into classrooms (id, user_id, subject, period, term_season, term_year, pinned_at) values
         ($1, $4, 'Homeroom',   1, 'fall', 2026, now()),
         ($2, $4, 'Study Hall', 2, 'fall', 2026, null),
         ($3, $4, 'Lab',        3, 'fall', 2026, null)`,
      [d.classroomA, d.classroomB, d.classroomC, uid]
    )

    const insertStudent = (
      sid: number,
      classroomId: string | null,
      name: string
    ) =>
      client.query(
        `insert into students (id, user_id, classroom_id, student_id, name)
         values ($1, $2, $3, $4, $5)`,
        [d.student(sid), uid, classroomId, sid, name]
      )

    for (const sid of ROSTER_A_SIDS) {
      await insertStudent(sid, d.classroomA, `Homeroom Student ${pad(sid, 2)}`)
    }
    for (const sid of ROSTER_C_SIDS) {
      await insertStudent(sid, d.classroomC, `Lab Student ${sid}`)
    }
    await insertStudent(UNASSIGNED_SID, null, "Unassigned Student")

    // sid 1 < sid 2 by construction (zero-padded roster number in the id tail),
    // so passing them in order satisfies CHECK (student_id_a < student_id_b).
    await client.query(
      `insert into student_separations (user_id, student_id_a, student_id_b) values ($1, $2, $3)`,
      [uid, d.student(1), d.student(2)]
    )

    // Saved seating chart on Classroom C. GET joins tables INNER JOIN seats, so
    // every seat slot needs a row (NULL student_id when empty).
    const insertTable = async (
      tableNumber: number,
      rows: number,
      cols: number,
      xPos: number,
      yPos: number,
      occupants: (number | null)[]
    ) => {
      const [{ id: tableId }] = (
        await client.query<{ id: string }>(
          `insert into tables (classroom_id, table_number, rows, cols, x_pos, y_pos)
           values ($1, $2, $3, $4, $5, $6) returning id`,
          [d.classroomC, tableNumber, rows, cols, xPos, yPos]
        )
      ).rows
      for (let seatNumber = 0; seatNumber < occupants.length; seatNumber++) {
        const sid = occupants[seatNumber]
        await client.query(
          `insert into seats (table_id, student_id, seat_number) values ($1, $2, $3)`,
          [tableId, sid === null ? null : d.student(sid), seatNumber]
        )
      }
    }

    await insertTable(0, 2, 2, 40, 40, [101, 102, null, null])
    await insertTable(1, 1, 2, 420, 40, [null, null])

    await client.query("commit")
  } catch (err) {
    await client.query("rollback")
    throw err
  } finally {
    client.release()
  }
}
