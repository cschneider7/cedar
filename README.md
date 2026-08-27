# Welcome to Cedar!

Cedar is a modern web application for creating seating charts and organizing classrooms.

## Features

- Student and classroom organization
- Randomly generate seating charts
- Call on random student to answer a question

## Installation

The full local dev environment (the Rust backend and the frontend) runs via Docker Compose — no native Node/Rust install required.

```bash
cp .env.example .env
# Fill in with credentials
docker compose up --build
```

- `api` → `http://localhost:3001` (Axum API)
- `ui` → `http://localhost:5173` (Vite dev server)

If you add/remove a dependency (`package.json` or `Cargo.toml`), run the build again:

```bash
docker compose up --build
```

## Build

Create a production build:

```bash
npm run build
```
