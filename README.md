# Welcome to Cedar!

Cedar is a modern web application for creating seating charts and organizing classrooms.

## Features

- Student and classroom organization
- Randomly generate seating charts
- Call on random student to answer a question

## Installation

The full local dev environment (the Rust backend and the frontend) runs via Docker Compose — no native Node/Rust install required. There's no local Postgres or MinIO: `DATABASE_URL` points directly (unpooled) at a real Neon `development` branch, and object storage is a real Cloudflare R2 bucket.

```bash
cp .env.example .env
# Fill in NEON_AUTH_URL / VITE_NEON_AUTH_URL, DATABASE_URL (a direct/unpooled
# connection string — `neon connection-string development --pooled=false`),
# and S3_* with real R2 dev-bucket credentials.
docker compose up --build
```

- `api` → `http://localhost:3000` (Axum API, hot-reloads via `cargo-watch`, migrations applied automatically on start)
- `ui` → `http://localhost:5173` (Vite dev server, HMR)

If you add/remove a dependency (`package.json` or `Cargo.toml`), run the build again:

```bash
docker compose up --build
```

Cargo's dependency cache (in its own named volumes) is additive, so `api` picks up `Cargo.toml` changes on the next `cargo watch` recompile with no extra step. `ui`'s `node_modules` is different — it lives in a named volume that's only ever populated once, so `--build` alone won't refresh it if a dependency was added/removed/changed (only installed). If `ui` doesn't pick up the change, clear that volume too: `docker compose down -v && docker compose up --build`.

## Build

Create a production build:

```bash
npm run build
```
