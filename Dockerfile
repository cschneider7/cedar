# Single source of truth for the toolchain/runtime versions used by every
# stage below — bump these (not the FROM lines) when the repo's own pinned
# versions change, instead of hunting down each `FROM node:...`/`FROM rust:...`.
# RUST_VERSION must match rust-toolchain.toml's `channel`; NODE_VERSION must
# match the version pinned in .github/workflows/node.js.yml.
ARG RUST_VERSION=1.97.1
ARG NODE_VERSION=26

# ---------------------------------------------------------------------------
# Backend (Rust/Axum, class_management package) — targets: backend-dev, backend
# ---------------------------------------------------------------------------
FROM rust:${RUST_VERSION}-slim-trixie AS backend-system-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config libssl-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Dev image (docker-compose.yaml builds this with `target: backend-dev`).
# Application source is bind-mounted at runtime for cargo-watch hot reload,
# not baked into the image — see docker-entrypoint.backend.sh.
FROM backend-system-deps AS backend-dev
RUN cargo install cargo-watch \
    && cargo install sqlx-cli --version 0.9.0 --no-default-features --features postgres,native-tls

COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src \
    && echo "fn main() {}" > src/main.rs \
    && cargo fetch --locked

COPY docker-entrypoint.backend.sh /usr/local/bin/docker-entrypoint.backend.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.backend.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.backend.sh"]

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
FROM node:${NODE_VERSION}-alpine AS frontend-development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

# Dev image (docker-compose.yaml builds this with `target: frontend-dev`).
# Application source is bind-mounted at runtime for Vite HMR, not baked in.
# node_modules lives in a named volume (see docker-compose.yaml) so the bind
# mount doesn't shadow it with the host's — the `npm ci` below only seeds
# that volume on its first population; docker-entrypoint.frontend.sh is
# what actually keeps it in sync with package-lock.json on every start.
FROM node:${NODE_VERSION}-alpine AS frontend-dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY docker-entrypoint.frontend.sh /usr/local/bin/docker-entrypoint.frontend.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.frontend.sh

EXPOSE 5173
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.frontend.sh"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Production build — last stage in the file, so it's also the default
# target for any build that doesn't pass --target explicitly.
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
