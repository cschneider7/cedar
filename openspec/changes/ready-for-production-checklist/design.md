## Context

See `proposal.md` for motivation. Constraints that shape the approach:

- **Supavisor transaction pooler.** Production `POSTGRES_URL` points at the
  Supabase transaction pooler (`:6543`). Connections are multiplexed per
  transaction, so a session-level `SET` issued outside a transaction can land on a
  different backend for the next statement. Handlers call `conn.query_typed(...)`
  — an unnamed prepared statement in one round-trip, not inside a transaction.
- **The Supabase Data API (PostgREST) is disabled and stays disabled.** It is
  configured with the `pg_pgrst_no_exposed_schemas` sentinel. Keeping it off is a
  standing operational constraint of this project, not an incidental state — it is
  what keeps the anon key shipped in the JS bundle from reaching the database
  directly. `anon` still holds `USAGE` on `public` and `SELECT` on the tenant
  tables today; the migration's `REVOKE` removes those grants so the tables are
  locked even if the Data API is ever turned on.
- **The backend connects as `postgres`** and continues to. It is the only client
  of the database; there is no PostgREST/`authenticated` path in play.
- **Roles are cluster-global, not per-database.** The migration's Data API
  lockdown names `anon` / `authenticated`, which the local Supabase stack has but
  CI's bare Postgres does not — the `TestDb` harness creates race-safe no-op
  stand-ins before running the migration verbatim.
- Frontend is React Router 8 framework mode (SSR) on Vercel; it emits an inline
  hydration script per document response. Static assets are served by Vercel's
  CDN, not the SSR handler.
- The app is live at `cedarcharts.vercel.app`. As of this writing the data
  footprint is tiny (1 auth user, 1 classroom, 5 students) — effectively the
  owner's own data — so the rollout's blast radius is small.
- **There is only one Supabase project** (`Cedar` / `agnnihedsecipkgosizc`).
  There is no separate `development` project.
- **Vercel `POSTGRES_URL` is a single variable** scoped to Production _and_
  Preview with the same value, so Preview writes hit the production database
  today. Splitting it so Preview connects as `preview_readonly` is part of this
  change (D2); Production's value does not change.
- **GitHub secret-scanning push protection is already enabled**; only
  non-provider pattern scanning is still off.

## Goals / Non-Goals

**Goals:**

- Tenant data is unreachable to anonymous callers and to the `anon` /
  `authenticated` roles, and stays unreachable even if the Data API is enabled.
- Preview deployments cannot mutate production data.
- Every classroom-scoped endpoint verifies ownership (closes the
  `cold_call_handler` gap).
- The public HTTP surface carries standard hardening headers and cannot be driven
  at abusive volume.
- Weak or breached passwords and unattended bot signups are rejected.
- Existing users are not locked out or disrupted by the rollout.

**Non-Goals:**

- **Row-level security / a database-side backstop for per-user isolation.**
  Considered and dropped (see D1). Row-level isolation stays entirely in the
  application layer.
- MFA, audit logging, session timeboxing, compliance programs, external pen test.
- DDoS protection beyond Vercel's built-in mitigation and the WAF.
- Migrating the frontend from the legacy `anon` JWT to a modern
  `sb_publishable_` key (worth doing later; not required here).
- RLS policies on `storage.objects` — the `students` bucket is already private
  with RLS on and zero policies (default-deny), and photo access goes through the
  backend's S3 credentials.
- A dedicated least-privilege `app_backend` login role for Production.
- Custom production domain setup.

## Decisions

### D1. Tenant isolation stays in the application; the database provides coarse backstops only

Row-level isolation — "user A never sees or writes user B's rows" — is enforced
**only** by the backend: `auth.rs` verifies every request's Supabase Auth JWT
against the project JWKS, and every handler scopes its queries with an explicit
`WHERE user_id = $1` (and, for `tables` / `seats`, a join to an owned classroom).
There is no database-side policy behind that.

**Why not RLS.** An earlier revision of this design added forced RLS + per-user
policies + a dedicated non-bypass role + a per-request identity GUC, as a second
independent layer so a forgotten `WHERE user_id` could not leak data. That is
dropped. The rationale for RLS was that the anon key in the JS bundle could reach
the tables through PostgREST; with the **Data API permanently disabled** and the
`anon` / `authenticated` grants **revoked** (see below), there is no path to the
database that is not the Rust backend, and the backend already authenticates and
scopes every request. RLS would only guard against a bug in the backend's own
query code — real, but judged not worth the standing cost here: a transaction +
`set_config` round-trip on every request, ~20 policies and two `SECURITY DEFINER`
helper functions to maintain, a cluster-role dependency in the test harness, and
a `POSTGRES_URL` cutover to a custom pooler role.

**Accepted trade-off.** A handler that forgets its `WHERE user_id` now leaks or
cross-writes data with no backstop. Mitigation is code-level: the per-user filter
is uniform across handlers, and the test suite has `cross_user_*` cases
(`GET`/`PATCH`/`DELETE`/`PUT` against another user's row → `404`) plus
`unauthenticated_requests_return_401`. New tenant-table handlers must add the same.

**What the database _does_ do:**

```sql
REVOKE ALL ON classrooms, students, tables, seats, student_separations
  FROM anon, authenticated;
```

This is the whole of the RLS section in the migration now. It is per-database and
safe to replay. With no grants, `anon` / `authenticated` get a permission error
on any tenant table — so even if PostgREST is later exposed, the tables return
nothing.

The three `user_id` indexes are kept — not for RLS (gone) but because every
handler's list query already filters on `user_id`:

```sql
CREATE INDEX IF NOT EXISTS classrooms_user_id_idx          ON classrooms (user_id);
CREATE INDEX IF NOT EXISTS students_user_id_idx            ON students (user_id);
CREATE INDEX IF NOT EXISTS student_separations_user_id_idx ON student_separations (user_id);
```

**No `begin_scoped` / identity GUC.** Handlers call `conn.query_typed*` /
`conn.execute_typed` directly, as before this change. The two multi-statement
writes (`update_seating_chart_handler`, `update_student_handler`) use a plain
`conn.transaction()`. `statement_timeout` / `idle_in_transaction_session_timeout`
are **not** set (they only made sense inside the identity transaction; the app
relies on Vercel's function timeout).

### D2. Preview isolation via the `preview_readonly` role

Today a single `POSTGRES_URL` variable is shared by Production and Preview. In the
Vercel dashboard, give Preview its own value that connects as
`preview_readonly.<ref>` — a `NOBYPASSRLS` login role with `USAGE` on `public` and
`SELECT` (only) on the five tenant tables. Production's value is unchanged
(`postgres.<ref>`).

A read works. A write hits the missing `INSERT` / `UPDATE` / `DELETE` grant →
`tokio_postgres::Error` with SQLSTATE `42501` (`INSUFFICIENT_PRIVILEGE`). Add
`AppError::ReadOnly` (HTTP `403`, body `"This environment is read-only."`) and map
`42501` to it in the `From<tokio_postgres::Error>` impl, so a Preview write
returns a clean client error instead of a 500. This is purely grant-based and
needs no RLS.

### D3. `preview_readonly` provisioning is out-of-band

`preview_readonly` is a cluster-global role and cannot live in the
per-test-database migration.

- The forward migration file carries only the three `user_id` indexes and the
  `REVOKE ALL ON <tenant tables> FROM anon, authenticated` Data API lockdown
  (both per-database, safe to replay). The `TestDb` harness runs the file
  verbatim; it first creates race-safe no-op `anon` / `authenticated` stand-ins
  so CI's bare Postgres (which lacks them) doesn't choke on the `REVOKE`.
- `preview_readonly` is provisioned once, by hand, in the Supabase SQL editor.
  **It already exists on the `Cedar` project** with exactly these grants — this
  block is idempotent if it ever needs re-running:

  ```sql
  DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'preview_readonly') THEN
      CREATE ROLE preview_readonly LOGIN NOBYPASSRLS PASSWORD '<generate one>';
    END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO preview_readonly;
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM preview_readonly;
  GRANT SELECT ON classrooms, students, tables, seats, student_separations
    TO preview_readonly;
  ```

- The Rust test suite does not touch `preview_readonly` at all. The
  `42501` → `AppError::ReadOnly` mapping lives in `error.rs`'s
  `From<tokio_postgres::Error>` impl; the end-to-end Preview read-only path is
  verified live during rollout (Migration Plan step 4 / task 6.1), not by a unit
  test — a SELECT-only-role harness fixture wasn't worth carrying for one
  assertion.

### D4. Ownership check on `cold_call_handler`

`cold_call_handler` ignores its `classroom_id` and the caller's user id. Add the
same `SELECT 1 FROM classrooms WHERE id = $1 AND user_id = $2` check the other
classroom-scoped handlers use (directly on the pooled connection), returning
`404` otherwise. The pick itself stays pure / DB-free.

### D5. Security headers: `vercel.json` for the static set, `entry.server` for CSP

`vercel.json` `headers` covers every response (including CDN assets) with
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, and `X-Frame-Options: DENY`.

CSP is set from `entry.server.tsx` on the document response, using React Router's
nonce support so the inline hydration script gets a per-response nonce and
`script-src` stays `'self' 'nonce-…'` (no `'unsafe-inline'` for scripts). Static
assets don't need CSP. Starting directive set, to be tightened against the live
app:

```
default-src 'self';
script-src 'self' 'nonce-{nonce}';
style-src 'self' 'unsafe-inline';           # Tailwind v4 + Base UI inject inline styles
img-src 'self' data: blob:;
connect-src 'self' https://agnnihedsecipkgosizc.supabase.co;
font-src 'self' data:;
frame-ancestors 'none';
base-uri 'self';
object-src 'none';
```

_Alternative:_ a fully static CSP in `vercel.json`. Rejected because the RR inline
hydration script would force `script-src 'unsafe-inline'`, defeating the point.
`style-src 'unsafe-inline'` is retained for now — Base UI's nonce plumbing
(`CSPContext`) is a later tightening, tracked as an open question.

### D6. Rate limiting via a Vercel WAF rate-limit rule (not in-app)

One WAF custom rule — `path` starts-with `/api/v1`, count by client IP, fixed
window (start ~200 req / 60s, tune from dashboard traffic), action `rate_limit`
(429). Configured via `vercel firewall` / the dashboard, no code.

- **Plan fit:** [WAF rate limiting is on Hobby](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
  — 1 rate-limit rule per project (all this needs), IP/JA4 keys, fixed-window,
  10s–10min window, 1M allowed requests included. Blocked requests are enforced
  at the edge and not billed.
- **Why not in-app (`tower-governor`):** an earlier revision added a
  `tower-governor` layer so the `429` body could carry `retry_after_secs`. But
  nothing consumes that field — `app/lib/api.ts` doesn't read `429`s, and no
  frontend code touches `Retry-After` — so it bought a dependency + ~200 lines
  of code and tests for a response detail no client reads. The `api-hardening`
  spec's rate-limit requirement was relaxed to "429, per-client, edge-enforced".
- **Why not the `@vercel/firewall` SDK:** `checkRateLimit()` is a JS package and
  `/api/v1/*` is served by the Rust function with no JS layer in front; using it
  would mean adding a `middleware.ts` invocation on every API request, and it
  only returns `{ rateLimited }` (no timing) anyway.
- `AppError::ReadOnly` (D2) stays — it is unrelated to rate limiting.

### D7. Auth hardening ordering

Order is load-bearing. Provider picks: **Cloudflare Turnstile** for the CAPTCHA
(account already exists; there is a `turnstile-spin` helper) and a transactional
provider (Resend / SES / SendGrid) for SMTP. Password policy:
`minimum_password_length` ≥ 8, `password_requirements =
lower_upper_letters_digits`, leaked-password protection on.

## Risks / Trade-offs

- **No database backstop for per-user isolation** → a handler that omits its
  `WHERE user_id` leaks or cross-writes data. Mitigation: the filter is uniform
  across handlers; `cross_user_*` and `unauthenticated_requests_return_401` tests
  guard the existing endpoints; new tenant handlers must add the same tests. This
  is the deliberate consequence of dropping RLS (D1).
- **The Data API must stay disabled** → if it is ever enabled, the `REVOKE` is
  the only thing standing between the anon key and the tables. Mitigation: task
  7.1 verifies the REVOKE holds with the Data API toggled on; the "keep it
  disabled" constraint is recorded in the spec.
- **Preview `POSTGRES_URL` cutover** → Supavisor must accept `preview_readonly.<ref>`.
  `preview_readonly` already exists on the project and is a Supabase-standard
  pattern; the Production value is untouched, so a bad Preview value only breaks
  Preview.
- **Enabling email confirmation locks out anyone currently unconfirmed** →
  Mitigation in the migration plan: SMTP first, backfill `email_confirmed_at`
  (a no-op today — 0 unconfirmed), then flip the toggle.
- **CSP breaks a page in production** → Mitigation: deploy CSP in
  `Content-Security-Policy-Report-Only` first, watch for violations, then enforce.

## Migration Plan

Step 3 (backend) and the CSP flip in step 5 are code changes that ship through a
normal PR + deploy. Everything else is a console operation, mostly point-and-click:

| Step                                   | Where it runs                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1 SMTP                                 | external provider signup + **Supabase dashboard** → Authentication → Emails → SMTP                                                 |
| 2 DB (preview role + REVOKE + indexes) | **Supabase dashboard** → SQL Editor (or MCP `apply_migration` / `execute_sql`)                                                     |
| 3 backend                              | code — PR + deploy                                                                                                                 |
| 4 Vercel env                           | **Vercel dashboard** → Settings → Environment Variables                                                                            |
| 5 headers                              | `vercel.json` ships in the PR; the `-Report-Only` → enforcing flip is a one-line code change + deploy                              |
| 6 auth toggles                         | **Supabase dashboard** → Authentication (+ **Cloudflare dashboard** → Turnstile for the widget; embedding it in `/signup` is code) |
| 7 rate-limit rule                      | **Vercel dashboard** → Firewall (or `vercel firewall rules add`)                                                                   |
| 8 CI / repo                            | `cargo audit` ships in the PR; **GitHub** → Settings → Advanced Security for the scanning toggle                                   |

1. **SMTP**: configure a production transactional email provider on the Supabase
   project; verify a test email delivers.
2. **DB (single production project)**: `preview_readonly` already exists with the
   right grants (D3). Apply the migration delta:
   `REVOKE ALL ON <the five tables> FROM anon, authenticated` and the three
   `user_id` indexes. Verify: as `anon`, `SELECT` on each tenant table is denied;
   as `preview_readonly` with an identity, reads work and writes fail; keep the
   Data API disabled.
3. **Backend**: ship `AppError::ReadOnly` (+ the `42501` mapping) and the
   `cold_call_handler` ownership check. No `begin_scoped`, no identity GUC, no
   statement timeouts, no in-app rate limiting.
4. **Vercel env**: give **Preview** its own `POSTGRES_URL` connecting as
   `preview_readonly.<ref>`; **Production's `POSTGRES_URL` is unchanged**
   (`postgres.<ref>`). Remove the unused vars (`SUPABASE_JWT_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY`,
   `SUPABASE_PUBLISHABLE_KEY`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`,
   `POSTGRES_USER/HOST/PASSWORD/DATABASE`).
5. **Frontend**: `vercel.json` header set; CSP in `entry.server` as
   report-only; deploy; watch reports; switch to enforcing.
6. **Auth toggles**: `email_confirmed_at` backfill is a no-op today (0 unconfirmed
   users) — still confirm the count is 0 immediately before flipping. Enable
   confirmations; raise password policy; enable leaked-password protection; create
   the Turnstile widget in the Cloudflare dashboard, wire it into the signup form
   (code) + set the Supabase captcha config.
7. **Rate-limit rule**: add one WAF rate-limit custom rule (`path` starts-with
   `/api/v1`, key `ip`, fixed window ~200 req / 60s) — start with `--rate-limit-action log`,
   review dashboard traffic, then switch to `rate_limit`.
8. **CI / repo**: add `cargo audit`; GitHub secret-scanning push protection is
   already on — enable non-provider patterns.

**Rollback:** the migration delta is reversible — re-`GRANT` to `anon` /
`authenticated`, `DROP INDEX`. Reverting Preview's `POSTGRES_URL` to the shared
value restores pre-change Preview behaviour. CSP is report-only until deliberately
enforced. The WAF rule can be set to `log` or deleted. Auth toggles are
independently reversible in the dashboard.

## Open Questions

- Exact rate-limit thresholds (requests/window) per route class.
- Exact `minimum_password_length` (8 vs 10) within the spec's "≥ 8" floor.
- Whether to tighten `style-src` off `'unsafe-inline'` using Base UI's nonce
  context now or as a follow-up.
- SMTP provider choice (Resend / SES / SendGrid).
