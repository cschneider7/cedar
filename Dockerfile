# ---------------------------------------------------------------------------
# Backend (Rust/Axum, class_management package) — targets: backend-dev, backend
# ---------------------------------------------------------------------------
FROM rust:1-slim-trixie AS backend-system-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config libssl-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Dev image (docker-compose.yaml builds this with `target: backend-dev`).
# Application source is bind-mounted at runtime for cargo-watch hot reload,
# not baked into the image — see docker-entrypoint.dev.sh.
FROM backend-system-deps AS backend-dev
RUN cargo install cargo-watch \
    && cargo install sqlx-cli --version 0.9.0 --no-default-features --features postgres,native-tls

COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src \
    && echo "fn main() {}" > src/main.rs \
    && cargo fetch --locked

COPY docker-entrypoint.dev.sh /usr/local/bin/docker-entrypoint.dev.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.dev.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.dev.sh"]

# Production build (fly.toml builds this with `build-target = "backend"`).
FROM backend-system-deps AS backend-builder
COPY Cargo.toml Cargo.lock ./
COPY src src
COPY .sqlx .sqlx
COPY migrations migrations

ENV SQLX_OFFLINE=true
RUN cargo build --release

FROM debian:trixie-slim AS backend
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /app/target/release/class_management /app/class_management

EXPOSE 3000
CMD ["/app/class_management"]

# ---------------------------------------------------------------------------
# Frontend (React Router) — targets: frontend-dev, frontend (default target)
# ---------------------------------------------------------------------------
FROM node:24-alpine AS frontend-development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

# Dev image (docker-compose.yaml builds this with `target: frontend-dev`).
# Application source is bind-mounted at runtime for Vite HMR, not baked in.
FROM node:24-alpine AS frontend-dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Production build — last stage in the file, so it's also the default
# target for any build that doesn't pass --target explicitly.
FROM node:24-alpine AS frontend-production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-alpine AS frontend-build-env
COPY . /app/
COPY --from=frontend-development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:24-alpine AS frontend
COPY ./package.json package-lock.json /app/
COPY --from=frontend-production-dependencies-env /app/node_modules /app/node_modules
COPY --from=frontend-build-env /app/build /app/build
WORKDIR /app
CMD ["npm", "run", "start"]
