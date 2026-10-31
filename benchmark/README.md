# Framework benchmark

This suite compares buncompiler, Hono on Bun, and NestJS using its official NodeAdapter on Node.js. Every server exposes the same three operations and response data:

- `GET /plain` — minimal text response
- `GET /users/:id` — path parsing and JSON serialization
- `POST /users` — JSON parsing, identical manual/schema validation, and JSON serialization

NestJS runs on Node because the NodeAdapter is Nest's officially recommended fastest adapter. This makes the benchmark representative of each framework's intended high-performance deployment, but it also means the Nest comparison includes a runtime difference. Record the runtime versions when publishing results.

## Requirements

- Bun 1.2 or newer
- Node.js 24 or newer
- `oha`
- `curl`

Bun's documentation recommends `oha`, `bombardier`, or `http_load_test` for HTTP load tests because a slower load generator can limit the measured server.

Install `oha` using one of its official methods, for example:

```bash
cargo install oha
```

or use a prebuilt binary from the oha releases page.

## Run

From the repository root:

```bash
bun install
chmod +x benchmark/run.sh
./benchmark/run.sh
```

Default settings run three 10-second repetitions per endpoint at 100 concurrent connections. Override them with environment variables:

```bash
DURATION=20s WARMUP=5s CONCURRENCY=200 REPEATS=5 ./benchmark/run.sh
```

For a quick smoke benchmark:

```bash
DURATION=2s WARMUP=1s CONCURRENCY=20 REPEATS=1 ./benchmark/run.sh
```

Results are saved under `benchmark/results/<UTC timestamp>/`:

- Raw oha JSON for every run
- Server logs
- Hardware and runtime metadata
- `summary.csv`
- `summary.md`

The summary reports median requests per second and latency across repetitions. Compare p95 and p99 alongside throughput; do not choose a winner from RPS alone.

See [`sample-results.md`](sample-results.md) for a short end-to-end smoke run and its limitations.

For cleaner results, run on an otherwise idle Linux machine, use performance CPU governor, keep the load generator on another machine when testing very high throughput, and never mix results from different hardware or runtime versions.
