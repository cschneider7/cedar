# Welcome to Cedar!

Cedar is a modern web application for creating seating charts and organizing classrooms.

## Features

- Student and classroom organization
- Randomly generate seating charts
- Call on random student to answer a question

## Installation

The full local dev environment (Postgres, the Rust backend, and the frontend) runs via Docker Compose — no native Node/Rust install required.

```bash
cp .env.example .env
# fill in CLERK_SECRET_KEY / VITE_CLERK_PUBLISHABLE_KEY with real Clerk dev keys
docker compose up --build
```

- `postgres` → `localhost:5432` (data persisted in a Docker volume)
- `backend` → `http://localhost:3000` (Axum API, hot-reloads via `cargo-watch`, migrations applied automatically on start)
- `frontend` → `http://localhost:5173` (Vite dev server, HMR)

If you add/remove a dependency (`package.json` or `Cargo.toml`) and rebuild the images, the cached `node_modules`/cargo volumes won't refresh automatically — clear them too:

```bash
docker compose build backend frontend
docker compose down -v
docker compose up
```

## Build

Create a production build:

```bash
npm run build
```
