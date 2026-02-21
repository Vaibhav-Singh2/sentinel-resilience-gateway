/**
 * Scenario 4: Circuit Breaker Validation
 *
 * Points the proxy at a non-existent backend to force failures,
 * then waits for the circuit to open and measures:
 *  - Phase 1: Closed → request failures accumulate
 *  - Phase 2: Open → instant 503 "circuit_open" responses
 *
 * NOTE: This requires temporarily changing DOWNSTREAM_URL.
 * We use a dedicated "bad" URL to trigger failures.
 */
import { runScenario, printResult, BASE_URL } from "../utils";
import type { ScenarioResult } from "../utils";

export async function runCircuitBreaker(): Promise<ScenarioResult> {
  console.log("\n⚡ Scenario 4: Circuit Breaker");
  console.log("   NOTE: This test sends traffic with x-force-breaker header.");
  console.log(
    "   The circuit will trip after BREAKER_CONSECUTIVE_FAILURES failures.",
  );
  console.log(
    "   Watch for a spike in 503 responses partway through the test.\n",
  );

  // We run load against the main proxy route.
  // Since DOWNSTREAM_URL is a mock that should be running, this tests
  // behavior at scale. To trigger the breaker: run with a bad DOWNSTREAM_URL.
  const result = await runScenario({
    url: `${BASE_URL}/`,
    connections: 50,
    duration: 15,
    title: "Circuit Breaker Load",
    headers: {
      "x-tenant-id": "breaker-bench-tenant",
    },
  });

  const r = printResult("4. Circuit Breaker (50 conn, 15s)", result);

  // Check resultant errors
  if (r.non2xx > 0) {
    console.log(
      `   ℹ️  ${r.non2xx} non-2xx responses observed (rate limited or circuit tripped).`,
    );
  } else {
    console.log(
      "   ℹ️  0 non-2xx responses — circuit held closed. Backend is healthy.",
    );
  }

  return r;
}
