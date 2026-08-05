#!/bin/sh
set -eu

echo "[backend] applying database migrations..."
sqlx migrate run --source migrations

echo "[backend] starting cargo-watch (hot reload on class_management/src, migrations)..."
exec cargo watch --workdir /app -w class_management/src -w migrations -x "run -p class_management"
