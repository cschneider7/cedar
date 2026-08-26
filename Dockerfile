ARG RUST_VERSION=1.97.1
ARG NODE_VERSION=26

# ---------------------------------------------------------------------------
# Backend (Rust/Axum, class_management package)
# ---------------------------------------------------------------------------
FROM rust:${RUST_VERSION}-slim-trixie AS backend-system-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Development image
FROM backend-system-deps AS backend-dev
RUN cargo install cargo-watch \
    && cargo install sqlx-cli --version 0.9.0 --no-default-features --features postgres,rustls

COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src \
    && echo "fn main() {}" > src/main.rs \
    && cargo fetch --locked

EXPOSE 3000

# ---------------------------------------------------------------------------
# Frontend (React Router) — targets: frontend-dev, frontend (default target)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS frontend-development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

# Development image
FROM node:${NODE_VERSION}-alpine AS frontend-dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Production image
FROM node:${NODE_VERSION}-alpine AS frontend-production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:${NODE_VERSION}-alpine AS frontend-build-env
COPY . /app/
COPY --from=frontend-development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS frontend
COPY ./package.json package-lock.json /app/
COPY --from=frontend-production-dependencies-env /app/node_modules /app/node_modules
COPY --from=frontend-build-env /app/build /app/build
WORKDIR /app
CMD ["npm", "run", "start"]
