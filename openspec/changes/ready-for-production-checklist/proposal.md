## Why

Cedar is already live and publicly reachable at `cedarcharts.vercel.app`, and its
production JavaScript bundle ships the Supabase project URL and anon key (as every
Supabase frontend does). Right now the only thing preventing anonymous read/write
of **every** user's classrooms, students, seats, and separations is a single
Supabase dashboard toggle (the Data API), which is disabled but is not backed by
revoked table grants, the migration, or the security advisor. A security
walkthrough of the Vercel / Supabase / Cloudflare stack also found no CSP or
anti-framing headers, no rate limiting on the public API, weak authentication
defaults (no email verification, 6-character passwords, leaked-password protection
off), and Preview deployments that read and write the production database. The
backend's per-user scoping and JWT verification are solid.

## What Changes

- **Lock the database down to the backend.** `REVOKE ALL` on `classrooms`,
  `students`, `tables`, `seats`, `student_separations` from the `anon` /
  `authenticated` roles, and keep the Supabase Data API disabled, so the only path
  to tenant data is the Rust backend (which already verifies the JWT and scopes
  every query by `user_id`). Row-level isolation stays in the application layer —
  **not** row-level security; RLS was designed and then dropped (see `design.md`
  D1) because with the Data API off and the grants revoked it guards only against
  a bug in the backend's own query code, at a standing cost not judged worth it
  here.
- **Preview database isolation.** Give Vercel **Preview** its own `POSTGRES_URL`
  connecting as the existing `preview_readonly` role (SELECT-only) so preview
  deployments can read but never mutate production data; the backend maps the
  resulting `42501` permission error to a clean `403` response. Production's
  `POSTGRES_URL` is unchanged.
- **HTTP security headers.** Serve `Content-Security-Policy`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and frame-ancestors
  restrictions from the frontend (HSTS is already present).
- **API rate limiting.** Reject abusive request volume to `/api/v1/*` with `429`
  via a Vercel WAF rate-limit custom rule (edge-enforced, per client IP) — no
  application code.
- **Authentication hardening.** Require email verification before access, raise
  the password minimum and add complexity/leaked-password checks, add a CAPTCHA
  to signup, and configure production SMTP so verification and reset email
  actually deliver.
- **Ownership check on `cold_call_handler`**, which currently ignores its
  `classroom_id` and the caller's user id.
- **Operational cleanup (no behavior change):** remove unused Vercel env vars
  (`SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`,
  `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER/HOST/
PASSWORD/DATABASE`, non-`VITE` key duplicates); enable GitHub secret-scanning
  push protection; add `cargo audit` to CI.

## Capabilities

### New Capabilities

- `data-isolation`: Each user's classroom data is private and isolated. Row-level
  isolation is enforced by the application (verified JWT + per-user query
  filters); the database backstops it by revoking all `anon` / `authenticated`
  access to the tenant tables (and the Data API stays disabled), and the Preview
  environment connects read-only. Every classroom-scoped API endpoint verifies
  ownership.
- `api-hardening`: The public HTTP surface resists common web attacks and abuse —
  security response headers on all frontend responses, and edge-enforced,
  per-client volume rate limiting on the JSON API that returns `429`.
- `account-security`: Account creation and sign-in are hardened against abuse and
  weak credentials — email verification required before data access, password
  strength and leaked-password enforcement, and bot protection on signup.

### Modified Capabilities

<!-- None. `student-list` behavior is unchanged. -->

## Impact

- **Database / migrations:** `supabase/migrations/20260826203344_create_tables.sql`
  gains only `REVOKE ALL ON <the five tables> FROM anon, authenticated` and three
  `user_id` indexes, applied out-of-band to the single production Supabase
  project via the dashboard SQL editor. The `preview_readonly` role (SELECT-only,
  for Preview deployments) is provisioned by hand in the SQL editor — see
  design.md D3; it already exists on the project. No RLS, no policies, no
  `private` schema, no `app_backend` role.
- **Backend (`src/`):** `error.rs` (`AppError::ReadOnly` + `42501` mapping),
  `handlers/classroom.rs::cold_call_handler` (ownership check). Handlers keep
  their direct `conn.query_typed*` calls — no identity GUC, no `begin_scoped`, no
  statement timeouts, no rate-limit middleware or dependency.
- **Frontend (`app/`):** security headers via `vercel.json` `headers` and
  `entry.server`.
- **Supabase project config:** Auth settings (confirmations, password policy,
  leaked-password protection, CAPTCHA), production SMTP provider; keep the Data
  API disabled.
- **Vercel project config:** Preview `POSTGRES_URL` (Production unchanged),
  env-var cleanup, one WAF rate-limit rule on `/api/v1/*`.
- **CI / repo (`.github/`):** `cargo audit` step, secret-scanning push protection.
- **Tests:** `cold_call_handler` ownership test. Preview read-only behaviour is
  verified live during rollout (task 6.1), not unit-tested.
