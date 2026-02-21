import autocannon from "autocannon";

export const BASE_URL = process.env.BENCH_URL || "http://localhost:3000";

export interface ScenarioResult {
  name: string;
  requests: { total: number; average: number };
  latency: { average: number; p99: number; max: number };
  errors: number;
  non2xx: number;
  throughput: { average: number };
}

export function printResult(name: string, result: any): ScenarioResult {
  const r: ScenarioResult = {
    name,
    requests: {
      total: result.requests.total,
      average: Math.round(result.requests.average),
    },
    latency: {
      average: result.latency.average,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    errors: result.errors,
    non2xx: result.non2xx,
    throughput: { average: result.throughput.average },
  };
  return r;
}

export function runScenario(
  opts: autocannon.Options,
): Promise<autocannon.Result> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err: any, result: any) => {
      if (err) return reject(err);
      resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}

export function printSummaryTable(results: ScenarioResult[]) {
  console.log("\n");
  console.log("=".repeat(90));
  console.log("  SENTINEL BENCHMARK SUMMARY");
  console.log("=".repeat(90));
  console.log(
    `  ${"Scenario".padEnd(35)} ${"Req/s".padEnd(10)} ${"Avg Lat".padEnd(12)} ${"P99 Lat".padEnd(12)} ${"non-2xx".padEnd(10)}`,
  );
  console.log("-".repeat(90));
  for (const r of results) {
    const avg = `${r.latency.average}ms`;
    const p99 = `${r.latency.p99}ms`;
    console.log(
      `  ${r.name.padEnd(35)} ${String(r.requests.average).padEnd(10)} ${avg.padEnd(12)} ${p99.padEnd(12)} ${String(r.non2xx).padEnd(10)}`,
    );
  }
  console.log("=".repeat(90));
}
