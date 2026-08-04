# Build context is the repo root (not class_management/), so the workspace
# Cargo.toml/Cargo.lock are visible per members = ["class_management"].
FROM rust:1-slim-trixie AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY class_management/Cargo.toml class_management/Cargo.toml
COPY class_management/src class_management/src
COPY .sqlx .sqlx
COPY migrations migrations

ENV SQLX_OFFLINE=true
RUN cargo build --release -p class_management

FROM debian:trixie-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/class_management /app/class_management

EXPOSE 3000
CMD ["/app/class_management"]
