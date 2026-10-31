import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

interface Row {
  framework: string;
  scenario: string;
  repeat: number;
  rps: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  successRate: number;
}

const directory = resolve(process.argv[2] ?? "benchmark/results/latest");
const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
const rows: Row[] = [];

for (const file of files) {
  const match = /^(buncompiler|hono|nestjs)-(plain|param|post)-(\d+)\.json$/.exec(file);
  if (!match) continue;
  const result = JSON.parse(await readFile(join(directory, file), "utf8"));
  const summary = result.summary ?? {};
  const percentiles = result.latencyPercentiles ?? {};
  rows.push({
    framework: match[1],
    scenario: match[2],
    repeat: Number(match[3]),
    rps: number(summary.requestsPerSec),
    averageMs: secondsToMs(summary.average),
    p50Ms: secondsToMs(percentile(percentiles, 50)),
    p95Ms: secondsToMs(percentile(percentiles, 95)),
    p99Ms: secondsToMs(percentile(percentiles, 99)),
    successRate: number(summary.successRate) * 100,
  });
}

if (!rows.length) throw new Error(`No oha JSON files found in ${directory}`);

const groups = Map.groupBy(rows, (row) => `${row.framework}:${row.scenario}`);
const aggregate = [...groups.entries()].map(([key, values]) => {
  const [framework, scenario] = key.split(":");
  return {
    framework,
    scenario,
    rps: median(values.map((row) => row.rps)),
    averageMs: median(values.map((row) => row.averageMs)),
    p50Ms: median(values.map((row) => row.p50Ms)),
    p95Ms: median(values.map((row) => row.p95Ms)),
    p99Ms: median(values.map((row) => row.p99Ms)),
    successRate: Math.min(...values.map((row) => row.successRate)),
  };
}).sort((a, b) => a.scenario.localeCompare(b.scenario) || b.rps - a.rps);

const columns = ["framework", "scenario", "rps", "average_ms", "p50_ms", "p95_ms", "p99_ms", "min_success_pct"];
const csv = [columns.join(","), ...aggregate.map((row) => [
  row.framework, row.scenario, fixed(row.rps, 2), fixed(row.averageMs, 3), fixed(row.p50Ms, 3),
  fixed(row.p95Ms, 3), fixed(row.p99Ms, 3), fixed(row.successRate, 3),
].join(","))].join("\n") + "\n";

const markdown = [
  "# Benchmark summary",
  "",
  "Results are medians across repeats. Higher RPS is better; lower latency is better.",
  "",
  "| Framework | Scenario | RPS | Average ms | p50 ms | p95 ms | p99 ms | Min success |",
  "|---|---|---:|---:|---:|---:|---:|---:|",
  ...aggregate.map((row) => `| ${row.framework} | ${row.scenario} | ${fixed(row.rps, 2)} | ${fixed(row.averageMs, 3)} | ${fixed(row.p50Ms, 3)} | ${fixed(row.p95Ms, 3)} | ${fixed(row.p99Ms, 3)} | ${fixed(row.successRate, 3)}% |`),
  "",
].join("\n");

await writeFile(join(directory, "summary.csv"), csv);
await writeFile(join(directory, "summary.md"), markdown);
console.log(markdown);

function percentile(values: Record<string, unknown>, wanted: number): number {
  for (const [key, value] of Object.entries(values)) {
    const normalized = key.toLowerCase().replaceAll("percentile", "").replaceAll("%", "").replace(/^p/, "");
    if (Number(normalized) === wanted) return number(value);
  }
  return Number.NaN;
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function secondsToMs(value: unknown): number { return number(value) * 1000; }
function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function fixed(value: number, digits: number): string { return Number.isFinite(value) ? value.toFixed(digits) : "n/a"; }
