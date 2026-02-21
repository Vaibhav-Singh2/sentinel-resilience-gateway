/**
 * Scenario 3: Tenant Priority Scheduling
 *
 * Sends mixed traffic with two tenants simultaneously:
 *  - "vital-bench-id" → mapped to Vital plan (guaranteed)
 *  - "economy-bench-id" → mapped to Economy plan (shed first)
 *
 * Runs both in parallel and compares drop rates.
 * Expected: Economy has significantly higher non-2xx rate under load.
 */
import autocannon from "autocannon";
import { BASE_URL } from "../utils";
import type { ScenarioResult } from "../utils";

function runTenantLoad(
  tenantId: string,
  connections: number,
  duration: number,
): Promise<autocannon.Result> {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url: `${BASE_URL}/`,
        connections,
        duration,
        headers: { "x-tenant-id": tenantId },
        title: `Tenant ${tenantId}`,
      },
      (err: any, result: any) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
  });
}

export async function runTenantPriority(): Promise<ScenarioResult[]> {
  console.log("\n👑 Scenario 3: Tenant Priority Scheduling (Vital vs Economy)");
  console.log("   Running both tenant loads in parallel for 10s...");

  // Use tenant IDs that the scheduler will map to Vital and Economy plans
  const [vitalResult, economyResult] = await Promise.all([
    runTenantLoad("vital-bench-id", 50, 10),
    runTenantLoad("economy-bench-id", 50, 10),
  ]);

  const vitalNon2xx = vitalResult.non2xx;
  const economyNon2xx = economyResult.non2xx;

  const vitalPct = ((vitalNon2xx / vitalResult.requests.total) * 100).toFixed(
    1,
  );
  const econPct = (
    (economyNon2xx / economyResult.requests.total) *
    100
  ).toFixed(1);

  console.log(
    `   ✅ Vital drop rate:   ${vitalNon2xx}/${vitalResult.requests.total} (${vitalPct}%)`,
  );
  console.log(
    `   ✅ Economy drop rate: ${economyNon2xx}/${economyResult.requests.total} (${econPct}%)`,
  );

  return [
    {
      name: "3a. Vital Tenant",
      requests: {
        total: vitalResult.requests.total,
        average: Math.round(vitalResult.requests.average),
      },
      latency: {
        average: vitalResult.latency.average,
        p99: vitalResult.latency.p99,
        max: vitalResult.latency.max,
      },
      errors: vitalResult.errors,
      non2xx: vitalNon2xx,
      throughput: { average: vitalResult.throughput.average },
    },
    {
      name: "3b. Economy Tenant",
      requests: {
        total: economyResult.requests.total,
        average: Math.round(economyResult.requests.average),
      },
      latency: {
        average: economyResult.latency.average,
        p99: economyResult.latency.p99,
        max: economyResult.latency.max,
      },
      errors: economyResult.errors,
      non2xx: economyNon2xx,
      throughput: { average: economyResult.throughput.average },
    },
  ];
}
