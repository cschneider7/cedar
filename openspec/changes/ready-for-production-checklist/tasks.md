<!--
Implementation split: the in-repo code tasks land on branch
`harden/ready-for-production-checklist`, verified locally (cargo test/clippy/fmt,
npm typecheck/test/build). The live-infrastructure tasks (1.3, 1.4, 3.4, 4.3,
groups 5-7) are console operations run by the owner following design.md's
Migration Plan — each is tagged with its dashboard; only 4.3 and the Turnstile
widget wiring are code.

RLS reversal (2026-09-01): the owner decided to drop row-level security entirely
— the Data API stays disabled always, so the `REVOKE` + app-layer per-user
filters are the whole isolation story. Tasks 1.1, 1.2, and group 2 were done for
the RLS design and are re-opened to strip it back out; see design.md D1.

Rate limiting (2026-09-01): switched from an in-app `tower-governor` layer to a
Vercel WAF rate-limit rule (edge, no code). Task 3.4 re-opened as an infra task;
`tower_governor` + `AppError::RateLimited` + the `Option<RateLimit>` param
removed; the `api-hardening` spec's rate-limit requirement relaxed to
"429, per-client, edge-enforced" (nothing consumed the `retry_after_secs` body).

Live-state facts: one Supabase project (no `development`); `POSTGRES_URL` is one
Vercel variable shared by Production + Preview; `preview_readonly` already exists
on the project; GitHub push protection is already on; 0 auth users unconfirmed;
data footprint is 1 user / 1 classroom / 5 students.
-->

## 1. Database lockdown

- [x] 1.1 `preview_readonly` role provisioning. — done: the role already exists on the `Cedar` project with `USAGE` on `public` + `SELECT`-only on the five tenant tables + a password (verified 2026-09-01). No repo artifact — the idempotent SQL is recorded in design.md D3 for re-runs. (`app_backend` was created during earlier RLS work and has since been dropped from the project.)
- [x] 1.2 Reduce the RLS section of `supabase/migrations/20260826203344_create_tables.sql` to: three `user_id` indexes before the `-- Cluster roles and Data API lockdown` marker, and `REVOKE ALL ON <the five tables> FROM anon, authenticated` after it (so `test_support::migration_sql()` still strips the REVOKE). Delete the `ENABLE ROW LEVEL SECURITY`, all 20 policies, the `private` schema + `owned_*` helper functions, and their grants. Update `CLAUDE.md`. — done; migration is 65 lines (was 230); applied to a scratch local DB → 0 policies, 3 indexes, `REVOKE` clean. `cargo fmt --check` + `clippy --all-targets --all-features -D warnings` clean; `cargo test --all-features` → 136 pass.
- [ ] 1.3 _(Supabase dashboard → SQL Editor, or MCP `execute_sql`)_ Against the single `Cedar` project, apply the migration delta — the whole change is: `REVOKE ALL ON classrooms, students, tables, seats, student_separations FROM anon, authenticated;` plus `CREATE INDEX IF NOT EXISTS {classrooms,students,student_separations}_user_id_idx ON <t> (user_id);`. (`preview_readonly` is already provisioned — task 1.1.) Verify: `SET ROLE anon; SELECT count(*) FROM students;` → permission denied; `SET ROLE preview_readonly;` reads work, an `INSERT`/`UPDATE`/`DELETE` fails with `42501`. Confirm the Data API is still disabled.
- [ ] 1.4 _(Supabase dashboard)_ After group 3 ships and Preview's `POSTGRES_URL` is repointed (task 6.1), confirm a signed-in user on Production still reads and writes normally, and a Preview deployment reads but cannot write.

## 2. Backend: remove the RLS identity scaffolding

- [x] 2.1 Remove `begin_scoped` (+ the `STATEMENT_TIMEOUT_MS` / `IDLE_IN_TXN_TIMEOUT_MS` constants and `Type` import) from `src/db.rs`. — done via `git checkout 49690c1~1 -- src/db.rs`; `db.rs` is back to `Db` + `build_pool` + TLS wiring only.
- [x] 2.2 Revert `handlers/classroom.rs`, `handlers/student.rs`, `handlers/separation.rs` to direct `let conn = data.db.get().await?;` + `conn.query_typed*`; helper fns take `&tokio_postgres::Client` again; app-level `WHERE user_id = $1` filters kept. — done (`student.rs`/`separation.rs` reverted wholesale; `classroom.rs` reverted then the `cold_call_handler` ownership check + 3 test changes re-applied). `grep -rn begin_scoped src/` is empty.
- [x] 2.3 Revert `update_seating_chart_handler` / `update_student_handler` to a bare `conn.transaction()`. — done (part of the 2.2 wholesale reverts).
- [x] 2.4 Delete `src/rls_tests.rs` + its `mod` line; strip `ensure_rls_roles` / `PREVIEW_READONLY_ROLE` / `APP_BACKEND_*` / `app_backend_pool` from `src/test_support.rs`; revert `migration_sql()`. — done; `cross_user_*` / `unauthenticated_requests_return_401` tests untouched. (`app_with_rate_limit` / `RateLimit` import later removed with the rate-limiter — task 3.4a.)
- [x] 2.5 Preview-read-only behaviour (`preview_readonly` → write → `42501` → `AppError::ReadOnly` → 403) is not unit-tested. A `preview_readonly_pool()` harness helper + `src/preview_readonly_tests.rs` were added then removed at the owner's request — the SELECT-only-role plumbing wasn't worth carrying for one assertion. The `42501` → `ReadOnly` mapping in `error.rs` is exercised by the type system; the end-to-end path is verified live in task 6.1 (a Preview write returns 403, no row changed). `test_support.rs` is back to its pre-change shape apart from the `migration_sql()` split marker.

## 3. Backend: preview read-only, ownership; edge rate limiting

- [x] 3.1 Add `AppError::ReadOnly` (HTTP 403, body "This environment is read-only.") and map `tokio_postgres::Error` SQLSTATE `42501` (`INSUFFICIENT_PRIVILEGE`) to it in the `From` impl. — done. (Re-verification now rides on the task 2.5 Preview-read-only test instead of the deleted `rls_tests` fail-closed case.)
- [x] 3.2 Add an ownership check to `cold_call_handler` (`SELECT 1 FROM classrooms WHERE id = $1 AND user_id = $2`, 404 otherwise). — done; the check now runs directly on `data.db.get()` (task 2.2 removes the `begin_scoped` it was written against). Covered by `cold_call_another_users_classroom_returns_404` + the updated cold-call tests.
- [ ] 3.4 _(Vercel dashboard → Firewall, or `vercel firewall rules add`)_ Add one WAF rate-limit custom rule: condition `path` starts-with `/api/v1`, action `rate_limit`, `--rate-limit-window 60`, `--rate-limit-requests 200` (tune later), `--rate-limit-keys ip`, `--rate-limit-algo fixed_window`. Stage with `--rate-limit-action log` first, review dashboard traffic, then switch to `rate_limit`. Hobby allows exactly 1 rate-limit rule — this is it. Verify: a scripted burst past the limit gets `429`; ordinary interactive use is unaffected.
- [x] 3.5 Add `cargo audit` to CI (`.github/workflows/test-suite.yml`, `Cargo Audit` job). Surfaced advisories resolved: `h2` → 0.4.19, `chacha20` → 0.10.2; `rsa` RUSTSEC-2023-0071 ignored via a documented `.cargo/audit.toml`. — done, unaffected (`h2` via `reqwest`/`hyper`, `chacha20` via `rand`/`tokio-postgres` — both stay after `tower_governor` is removed).

<!-- 3.3 (statement_timeout / idle_in_transaction_session_timeout) is dropped: it
only existed inside begin_scoped's transaction; the app relies on Vercel's
function timeout. The in-app tower_governor rate limiter (earlier 3.4) is
replaced by the WAF rule above; `tower_governor`, `AppError::RateLimited`, the
`Option<RateLimit>` create_router param, `app_with_rate_limit`, and the 3
`routes::tests` are all removed. -->

### Code removed for the WAF-rate-limit switch (done)

- [x] 3.4a Remove the `tower_governor` dependency (`Cargo.toml` + `Cargo.lock` subtree), the `RateLimit` struct / `rate_limit_response` / `Option<RateLimit>` param / governor layer in `routes.rs` and its `#[cfg(test)] mod tests`, `AppError::RateLimited` (+ its `IntoResponse` / `detail` arms and the `RETRY_AFTER` header block), the 4th `create_router` arg in `main.rs` / `api/index.rs`, and `app_with_rate_limit` in `test_support.rs`. Kept `AppError::ReadOnly`. — done via `git checkout 49690c1~1 -- src/routes.rs src/error.rs src/main.rs api/index.rs` then re-adding `ReadOnly`; `cargo fmt --check` + `clippy --all-targets --all-features -D warnings` clean; `cargo test --all-features` → 133 pass.

## 4. Frontend: security headers

- [x] 4.1 Add a `headers` block to `vercel.json` applying `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: DENY` to all paths.
- [x] 4.2 Emit a per-response nonce'd `Content-Security-Policy-Report-Only` header from a new `app/entry.server.tsx` — nonce per request, passed to `<ServerRouter nonce>` + `renderToPipeableStream({ nonce })` and provided via `NonceContext` (`app/lib/nonce.ts`) so `root.tsx` passes it to `<ThemeProvider nonce>` / `<Scripts nonce>` / `<ScrollRestoration nonce>`. Skipped in `import.meta.env.DEV`.
- [ ] 4.3 _(code change + deploy — not a dashboard action)_ Switch `CSP_HEADER` in `app/entry.server.tsx` from `-Report-Only` to enforcing `Content-Security-Policy` once a preview session is clean. Verify the `api-hardening` spec's three header scenarios.

## 5. Supabase Auth hardening

- [ ] 5.1 _(Supabase dashboard → Authentication → Emails → SMTP; provider account created separately)_ Configure a production transactional SMTP provider. Verify a password-reset email for a test account is delivered to a real inbox.
- [ ] 5.2 _(Supabase dashboard → Authentication → Sign In / Providers → Password)_ Raise `minimum_password_length` (≥ 8), set `password_requirements = lower_upper_letters_digits`, enable leaked-password protection. Verify signup + reset reject a 6-char password and a known-breached password like `Password123`; the `get_advisors` security check no longer flags `auth_leaked_password_protection`.
- [ ] 5.3 _(Supabase dashboard → Authentication → Sign In / Providers → Email; backfill via SQL Editor)_ Backfill `email_confirmed_at` (a no-op today — 0 unconfirmed; still re-check right before flipping), then set `enable_confirmations = true`. Verify an existing user still signs in; a new account is gated until the link is clicked and can request a resend.
- [ ] 5.4 _(Cloudflare dashboard → Turnstile for the widget; Supabase dashboard → Authentication → Attack Protection for the secret; the `/signup` form change is code)_ Provision a Turnstile widget, add it to `/signup`, set the Supabase captcha config (provider `turnstile`, secret). Verify a signup without a valid token is rejected; a completed challenge lets a valid signup through and triggers the verification email.

## 6. Config cleanup and repo hardening

- [ ] 6.1 _(Vercel dashboard → Settings → Environment Variables)_ `POSTGRES_URL` is one variable shared by Production + Preview. Give **Preview** its own value connecting as `preview_readonly.<ref>`; **leave Production's value unchanged** (`postgres.<ref>`). Verify: production smoke test (sign in, create + edit + delete a student) succeeds; the same flow on a preview deployment loads data but returns the 403 read-only error on any write, with no row changed.
- [ ] 6.2 _(Vercel dashboard → Settings → Environment Variables)_ Remove the unused vars: `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`. Verify a fresh production deployment builds and runs green (`grep -rn "process.env\." app/ src/ api/` + the Rust `std::env::var` calls confirm none are referenced).
- [ ] 6.3 _(GitHub → Settings → Advanced Security)_ Push protection is already enabled — enable `secret_scanning_non_provider_patterns`. Verify `gh api repos/cschneider7/cedar --jq '.security_and_analysis'` shows `secret_scanning_push_protection` and `secret_scanning_non_provider_patterns` both `enabled`.

## 7. End-to-end verification

- [ ] 7.1 From an anonymous client, pull the live JS bundle's Supabase URL + anon key and confirm a direct `POST`/`GET` to `…/rest/v1/students` returns no rows and cannot write — with the Data API in its current (disabled) state, and again after briefly toggling it on against the `Cedar` project to confirm the `REVOKE` holds, then toggling it back off. (This is the isolation backstop now that there is no RLS.)
- [ ] 7.2 Two-account manual test against the `Cedar` project (two throwaway accounts, delete their data after): account A cannot see or mutate account B's classrooms, students, seating charts, or separations through any `/api/v1` endpoint — GET/PATCH/DELETE/PUT plus the seating-chart, cold-call, and separations routes. This is the primary tenant-isolation check (app-layer only).
- [ ] 7.3 _(Supabase dashboard advisors or MCP `get_advisors`)_ Re-run the security advisors and confirm no new security-level findings; confirm `cedarcharts.vercel.app` is fully functional for a signed-in user post-rollout.
