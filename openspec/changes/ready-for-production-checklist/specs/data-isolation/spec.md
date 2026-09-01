## Purpose

Guarantees that each user's classroom, student, seat, and separation data is
private and isolated from every other user and from anonymous callers. Row-level
isolation is enforced by the application (verified identity + per-user query
filters on every tenant table); the database provides coarse backstops — no
privileges for the `anon` / `authenticated` roles, a read-only Preview
environment — and the Supabase Data API stays disabled.

## ADDED Requirements

### Requirement: Application-enforced tenant isolation

Every API request that reads or writes a tenant table (`classrooms`, `students`,
`tables`, `seats`, `student_separations`) SHALL be constrained to the rows owned
by the verified user of that request. The backend SHALL verify the request's
Supabase Auth JWT and SHALL scope every tenant query by the verified user id;
`tables` and `seats`, which have no `user_id` column, SHALL be scoped through
their owning classroom.

- A request without a valid token SHALL be rejected before any tenant query runs.
- There is no database-side row-level backstop: correctness of the per-user
  scoping depends on the handler code and its tests.

#### Scenario: Cross-user read is not returned

- **WHEN** user A requests a classroom, student, seating chart, or separation
  owned by user B, by id
- **THEN** the API responds `404` and returns none of user B's data

#### Scenario: Cross-user write is rejected

- **WHEN** user A attempts to update or delete a `classrooms` / `students` /
  `student_separations` row owned by user B, addressing it by id
- **THEN** the API responds `404` and no row is modified

#### Scenario: Unauthenticated request is refused

- **WHEN** a request to any `/api/v1` tenant endpoint carries no valid Supabase
  Auth bearer token
- **THEN** the API responds `401` and runs no query

### Requirement: No access for non-application database roles

The `anon` and `authenticated` database roles SHALL hold no privileges on any
tenant table, and the Supabase Data API SHALL remain disabled for the project.
The revoked grants are the backstop: tenant data SHALL stay inaccessible to those
roles even if the Data API is later enabled.

#### Scenario: Anonymous REST access returns nothing

- **WHEN** a caller queries the project's REST API for a tenant table using the
  public anon key
- **THEN** the response contains no tenant rows (the request is rejected or
  returns an empty result)

#### Scenario: Re-enabling the Data API does not expose tenant data

- **WHEN** the Supabase Data API is enabled for the project
- **THEN** requests to tenant tables as `anon` or `authenticated` still fail with
  a permission error and return no rows

### Requirement: Read-only Preview environment

The Preview deployment's database principal SHALL be able to read tenant data but
SHALL NOT be able to insert, update, or delete it. A write attempted from a
Preview deployment SHALL surface as a clean client-facing error, not a generic
500, and SHALL leave no partial change.

#### Scenario: Write from Preview is refused cleanly

- **WHEN** a user on a Preview deployment submits a create, update, or delete of a
  student, classroom, or separation
- **THEN** the API responds with a clear client error indicating the environment
  is read-only
- **AND** no row is created, modified, or removed

#### Scenario: Read from Preview works

- **WHEN** a user on a Preview deployment lists or views their classrooms and
  students
- **THEN** the data loads normally

### Requirement: Ownership verification on classroom-scoped endpoints

Every API endpoint that accepts a `classroom_id` SHALL confirm the classroom
belongs to the requesting user before performing any work, returning `404` when
it does not.

#### Scenario: Cold call against another user's classroom

- **WHEN** a user calls the cold-call endpoint with a `classroom_id` owned by a
  different user
- **THEN** the API responds `404` and performs no pick

#### Scenario: Cold call against an owned classroom

- **WHEN** a user calls the cold-call endpoint with a `classroom_id` they own
- **THEN** the pick is performed and returned
