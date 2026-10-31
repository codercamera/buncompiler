# Smoke benchmark example

These results verify that the benchmark runs end to end. They are **not** authoritative performance claims: each scenario ran for only two seconds, with one repetition, and the load generator shared the same managed machine as the server.

Environment:

- AMD EPYC 9V74 host
- Linux 6.18.57
- Bun 1.4.4
- Node.js 24.22.1
- oha 1.16.0
- 20 concurrent connections
- 1-second warm-up
- 2-second measurement
- 1 repetition

| Framework | Scenario | RPS | Average ms | p50 ms | p95 ms | p99 ms | Success |
|---|---|---:|---:|---:|---:|---:|---:|
| Hono | Plain | 96,140.49 | 0.207 | 0.184 | 0.375 | 0.481 | 100% |
| buncompiler | Plain | 81,735.82 | 0.243 | 0.214 | 0.438 | 0.542 | 100% |
| NestJS | Plain | 48,989.39 | 0.407 | 0.379 | 0.754 | 0.920 | 100% |
| Hono | Parameter | 80,640.66 | 0.247 | 0.215 | 0.447 | 0.579 | 100% |
| buncompiler | Parameter | 75,539.11 | 0.263 | 0.230 | 0.476 | 0.587 | 100% |
| NestJS | Parameter | 37,511.58 | 0.531 | 0.485 | 0.951 | 1.267 | 100% |
| buncompiler | JSON POST | 62,940.26 | 0.316 | 0.271 | 0.559 | 0.794 | 100% |
| Hono | JSON POST | 60,373.98 | 0.329 | 0.280 | 0.587 | 0.855 | 100% |
| NestJS | JSON POST | 27,005.46 | 0.738 | 0.671 | 1.310 | 1.789 | 100% |

In this smoke run, Hono led the two GET scenarios, buncompiler narrowly led the validated POST scenario, and both Bun implementations were ahead of NestJS. Run the default three repetitions—or preferably five longer repetitions on a dedicated machine—before drawing conclusions.
