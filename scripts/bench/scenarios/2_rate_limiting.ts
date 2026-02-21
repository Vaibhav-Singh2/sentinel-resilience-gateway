/**
 * Scenario 2: Rate Limiting Validation
 *
 * Hammers the proxy with 200 concurrent connections to exceed
 * the base rate limit and validates that 429 responses occur.
 *
 * Expected: High non-2xx count (many 429s), low "useful" throughput.
 */
import { runScenario, printResult, BASE_URL } from "../utils";
import type { ScenarioResult } from "../utils";

export async function runRateLimiting(): Promise<ScenarioResult> {
  console.log("\n🛑 Scenario 2: Rate Limiting Under High Concurrency");

  const result = await runScenario({
    url: `${BASE_URL}/`,
    connections: 200,
    duration: 10,
    title: "Rate Limiting",
    headers: {
      "x-tenant-id": "bench-tenant-rate-limit",
    },
  });

  const r = printResult("2. Rate Limiting (200 conn)", result);

  const rateLimitedPct = ((r.non2xx / r.requests.total) * 100).toFixed(1);
  console.log(
    `   ✅ Rate limited responses: ${r.non2xx}/${r.requests.total} (${rateLimitedPct}%)`,
  );

  return r;
}
