/**
 * Sentinel Benchmark Runner
 *
 * Runs all benchmark scenarios sequentially and prints a summary table.
 *
 * Usage:
 *   bun run bench
 *
 * Options (env vars):
 *   BENCH_URL   - Base URL of the Sentinel proxy (default: http://localhost:3000)
 */
import { printSummaryTable } from "./utils";
import type { ScenarioResult } from "./utils";
import { runBaseline } from "./scenarios/1_baseline";
import { runRateLimiting } from "./scenarios/2_rate_limiting";
import { runTenantPriority } from "./scenarios/3_tenant_priority";
import { runCircuitBreaker } from "./scenarios/4_circuit_breaker";
import { runSLO } from "./scenarios/5_slo";

const BENCH_URL = process.env.BENCH_URL || "http://localhost:3000";

async function main() {
  console.log("=".repeat(60));
  console.log("  🛡️  SENTINEL BENCHMARK SUITE");
  console.log(`  Target: ${BENCH_URL}`);
  console.log("=".repeat(60));

  // Check if Sentinel is up
  try {
    const health = await fetch(`${BENCH_URL}/health`);
    if (!health.ok) throw new Error(`Status: ${health.status}`);
    console.log("  ✅ Sentinel is running. Starting benchmarks...\n");
  } catch (e: any) {
    console.error(`  ❌ Sentinel is not reachable at ${BENCH_URL}/health`);
    console.error(`     Error: ${e.message}`);
    console.error("     Start Sentinel with: bun run dev");
    process.exit(1);
  }

  const results: ScenarioResult[] = [];

  // Run all scenarios
  results.push(await runBaseline());
  results.push(await runRateLimiting());
  results.push(...(await runTenantPriority()));
  results.push(await runCircuitBreaker());
  results.push(await runSLO());

  // Print final summary
  printSummaryTable(results);
}

main().catch((err) => {
  console.error("Benchmark runner crashed:", err);
  process.exit(1);
});
