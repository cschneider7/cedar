#!/bin/sh
set -eu

echo "[backend] applying database migrations..."
sqlx migrate run --source migrations

echo "[backend] starting cargo-watch (hot reload on src, migrations)..."
exec cargo watch --workdir /app -w src -w migrations -x "run --bin class_management"
