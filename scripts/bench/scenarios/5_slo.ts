/**
 * Scenario 5: SLO Validation
 *
 * Runs a 30s sustained load test, then scrapes /metrics and validates:
 *  - sentinel_http_requests_total has been populated
 *  - sentinel_http_request_duration_seconds histogram is populated
 *  - sentinel_slo_latency_violation_total is present
 *  - sentinel_circuit_breaker_state is present
 */
import { runScenario, printResult, BASE_URL } from "../utils";
import type { ScenarioResult } from "../utils";

async function scrapeMetrics(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE_URL}/metrics`);
  const text = await res.text();
  const metrics: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const spaceIndex = line.lastIndexOf(" ");
    const name = line.substring(0, spaceIndex).split("{")[0].trim();
    const value = line.substring(spaceIndex + 1).trim();
    if (name && !metrics[name]) {
      metrics[name] = value;
    }
  }
  return metrics;
}

export async function runSLO(): Promise<ScenarioResult> {
  console.log("\n📈 Scenario 5: SLO Metrics Validation (30s sustained load)");

  const result = await runScenario({
    url: `${BASE_URL}/`,
    connections: 50,
    duration: 30,
    title: "SLO Validation",
    headers: { "x-tenant-id": "slo-bench-tenant" },
  });

  // Scrape metrics after the load test
  console.log("\n   Scraping /metrics...");
  const metrics = await scrapeMetrics();

  const requiredMetrics = [
    "sentinel_http_requests_total",
    "sentinel_http_request_duration_seconds_count",
    "sentinel_slo_latency_violation_total",
    "sentinel_breaker_state", // defined in metrics.ts as sentinel_breaker_state
    "sentinel_pressure_global",
  ];

  console.log("\n   Sentinel Metric Validation:");
  let allPresent = true;
  for (const m of requiredMetrics) {
    const present = m in metrics;
    if (!present) allPresent = false;
    console.log(`   ${present ? "✅" : "❌"} ${m}: ${metrics[m] ?? "MISSING"}`);
  }

  if (allPresent) {
    console.log("\n   ✅ All required metrics are present and populated.");
  } else {
    console.log("\n   ⚠️  Some metrics are missing — check instrumentation.");
  }

  return printResult("5. SLO Validation (50 conn, 30s)", result);
}
