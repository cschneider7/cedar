# Welcome to Cedar!

Cedar is a modern web application for creating seating charts and organizing classrooms.

## Features

- Student and classroom organization
- Randomly generate seating charts
- Call on random student to answer a question

## Prerequisites

- **Docker** — runs the app containers and the local Supabase stack
- **Node 26** — for the CLIs and the test suites
- **Rust 1.97** — only if you run the backend or its tests natively

## Installation

The app itself (Rust backend + frontend) runs in Docker Compose, but it depends
on a local Supabase stack (Postgres, Auth, Storage) started by the Supabase CLI —
the backend exits on startup if it can't reach it.

```bash
npm ci
cp .env.example .env

npx supabase start          # Postgres :54322, Auth/Storage :54321 — prints keys
npx supabase status         # re-print the keys any time
```

Fill the blank values in `.env` from that output (see the comments in
`.env.example` for exactly which fields map where):

- `VITE_PUBLIC_SUPABASE_ANON_KEY` ← `anon key`
- the `S3_*` block ← the `S3 …` / storage values

Then start the app:

```bash
docker compose up --build   # api → http://localhost:3001, ui → http://localhost:5173
```

Re-run `docker compose up --build` after changing `package.json` or `Cargo.toml`.
After adding a database migration, run `npx supabase db reset` (applies
`supabase/migrations/*.sql` + `supabase/seed.sql`).

## Testing

The local Supabase stack (`npx supabase start`) must be running for everything
except the frontend unit tests.

### Frontend unit tests

Route loader/action logic and pure helpers, under `tests/unit/`. No running stack
needed.

```bash
npm test
```

### Backend unit tests

Colocated `#[cfg(test)]` modules; each spins up a throwaway database against the
local Supabase Postgres.

```bash
cargo test --all-features
```

### End-to-end Playwright tests

Browser tests of the full app, under `tests/e2e/`.

```bash
npx playwright install chromium   # one-time
npm run test:e2e
```

## Checks

```bash
npm run typecheck                    # react-router typegen + tsc
npx prettier --check .               # frontend formatting
cargo fmt --check                    # backend formatting
cargo clippy --all-targets -- -D warnings
```

## Build

Create a production build:

```bash
npm run build
```
