/**
 * Scenario 1: Baseline Throughput
 *
 * Tests raw throughput on /health endpoint with:
 * - No rate limiting (because /health bypasses proxy guardian logic)
 * - 100 concurrent connections for 10 seconds
 *
 * Expected: Highest req/sec, lowest latency of all scenarios.
 */
import { runScenario, printResult, BASE_URL } from "../utils";
import type { ScenarioResult } from "../utils";

export async function runBaseline(): Promise<ScenarioResult> {
  console.log("\n📊 Scenario 1: Baseline Throughput (/health)");

  const result = await runScenario({
    url: `${BASE_URL}/health`,
    connections: 100,
    duration: 10,
    title: "Baseline - /health",
  });

  return printResult("1. Baseline (/health)", result);
}
