#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DURATION="${DURATION:-10s}"
WARMUP="${WARMUP:-2s}"
CONCURRENCY="${CONCURRENCY:-100}"
REPEATS="${REPEATS:-3}"
PORT="${PORT:-4100}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESULT_DIR="${RESULT_DIR:-benchmark/results/$STAMP}"
SERVER_PID=""

for command in bun node oha curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    echo "See benchmark/README.md for installation instructions." >&2
    exit 1
  fi
done

mkdir -p "$RESULT_DIR" benchmark/buncompiler/generated benchmark/buncompiler/dist benchmark/hono/dist benchmark/nest/dist

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Building benchmark servers..."
bun src/cli.ts benchmark/buncompiler/app.ts -o benchmark/buncompiler/generated/server.ts
bun build benchmark/buncompiler/generated/server.ts --target=bun --minify --outfile benchmark/buncompiler/dist/server.js
bun build benchmark/hono/server.ts --target=bun --minify --outfile benchmark/hono/dist/server.js
bunx tsc -p benchmark/nest/tsconfig.json

{
  echo "timestamp_utc=$STAMP"
  echo "duration=$DURATION"
  echo "warmup=$WARMUP"
  echo "concurrency=$CONCURRENCY"
  echo "repeats=$REPEATS"
  echo "os=$(uname -a)"
  echo "cpu=$(command -v lscpu >/dev/null 2>&1 && lscpu | sed -n 's/^Model name:[[:space:]]*//p' | head -1 || echo unknown)"
  echo "bun=$(bun --version)"
  echo "node=$(node --version)"
  echo "oha=$(oha --version)"
} > "$RESULT_DIR/environment.txt"

wait_for_server() {
  for _attempt in $(seq 1 100); do
    if curl -fsS "http://127.0.0.1:$PORT/plain" >/dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "Server failed to start. Log:" >&2
  sed -n '1,160p' "$RESULT_DIR/$1-server.log" >&2
  exit 1
}

run_oha() {
  local framework="$1" scenario="$2" repeat="$3" url="$4"
  shift 4
  echo "  $framework / $scenario / repeat $repeat"
  oha --no-tui --output-format json -z "$DURATION" -c "$CONCURRENCY" "$@" \
    "http://127.0.0.1:$PORT$url" > "$RESULT_DIR/$framework-$scenario-$repeat.json"
}

run_framework() {
  local framework="$1"
  shift
  echo
  echo "Starting $framework..."
  PORT="$PORT" "$@" > "$RESULT_DIR/$framework-server.log" 2>&1 &
  SERVER_PID=$!
  wait_for_server "$framework"

  oha --no-tui --output-format quiet -z "$WARMUP" -c "$CONCURRENCY" "http://127.0.0.1:$PORT/plain" >/dev/null
  for repeat in $(seq 1 "$REPEATS"); do
    run_oha "$framework" plain "$repeat" "/plain"
    run_oha "$framework" param "$repeat" "/users/123"
    run_oha "$framework" post "$repeat" "/users" -m POST -H "content-type: application/json" -d '{"name":"Ada","score":42}'
  done

  cleanup
  SERVER_PID=""
}

run_framework buncompiler bun benchmark/buncompiler/dist/server.js
run_framework hono bun benchmark/hono/dist/server.js
run_framework nestjs node benchmark/nest/dist/server.js

bun benchmark/summarize.ts "$RESULT_DIR"
echo "Full results: $RESULT_DIR"
