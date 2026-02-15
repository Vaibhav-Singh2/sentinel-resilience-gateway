import { FastifyInstance } from "fastify";
import client from "prom-client";

// Create a Registry
const register = new client.Registry();

// Add default metrics (cpu, memory, etc.)
client.collectDefaultMetrics({ register });

// Define custom metrics
export const httpRequestsTotal = new client.Counter({
  name: "sentinel_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const requestForwardedTotal = new client.Counter({
  name: "sentinel_request_forwarded_total",
  help: "Total number of requests forwarded upstream",
  labelNames: ["method", "upstream_url"],
  registers: [register],
});

export const requestTimeoutTotal = new client.Counter({
  name: "sentinel_request_timeout_total",
  help: "Total number of request timeouts",
  labelNames: ["method"],
  registers: [register],
});

export const localBucketAllowedTotal = new client.Counter({
  name: "sentinel_local_bucket_allowed_total",
  help: "Total number of requests allowed by local token bucket",
  labelNames: ["tenant_id"],
  registers: [register],
});

export const localBucketRejectedTotal = new client.Counter({
  name: "sentinel_local_bucket_rejected_total",
  help: "Total number of requests rejected by local token bucket",
  labelNames: ["tenant_id"],
  registers: [register],
});

export const distributedAllowedTotal = new client.Counter({
  name: "sentinel_distributed_allowed_total",
  help: "Total number of requests allowed by distributed rate limiter",
  labelNames: ["tenant_id"],
  registers: [register],
});

export const distributedRejectedTotal = new client.Counter({
  name: "sentinel_distributed_rejected_total",
  help: "Total number of requests rejected by distributed rate limiter",
  labelNames: ["tenant_id"],
  registers: [register],
});

export const redisLatencyHistogram = new client.Histogram({
  name: "sentinel_redis_latency_ms",
  help: "Latency of Redis operations in milliseconds",
  labelNames: ["operation"],
  buckets: [1, 5, 10, 20, 50, 100, 200, 500],
  registers: [register],
});

export const pressureLocal = new client.Gauge({
  name: "sentinel_pressure_local",
  help: "Current local pressure score (0-1)",
  registers: [register],
});

export const pressureGlobal = new client.Gauge({
  name: "sentinel_pressure_global",
  help: "Current global pressure score (0-1)",
  registers: [register],
});

export const protectionModeMetric = new client.Gauge({
  name: "sentinel_protection_mode",
  help: "Current protection mode (0=NORMAL, 1=MODERATE, 2=AGGRESSIVE, 3=CRITICAL)",
  registers: [register],
});

export const breakerStateMetric = new client.Gauge({
  name: "sentinel_breaker_state",
  help: "Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)",
  labelNames: ["service"],
  registers: [register],
});

export const breakerOpenTotal = new client.Counter({
  name: "sentinel_breaker_open_total",
  help: "Total number of times circuit breaker opened",
  labelNames: ["service"],
  registers: [register],
});

export const tenantRequestTotal = new client.Counter({
  name: "sentinel_tenant_requests_total",
  help: "Total requests per tenant plan",
  labelNames: ["plan"],
  registers: [register],
});

export const priorityDropsTotal = new client.Counter({
  name: "sentinel_priority_drops_total",
  help: "Total requests dropped due to priority scheduling",
  labelNames: ["plan", "mode"],
  registers: [register],
});

export const degradedResponseTotal = new client.Counter({
  name: "sentinel_degraded_response_total",
  help: "Total degraded responses served",
  registers: [register],
});

export const premiumPreservedTotal = new client.Counter({
  name: "sentinel_premium_preserved_total",
  help: "Total premium requests preserved under pressure",
  labelNames: ["tenant_id"],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: "sentinel_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code", "plan"],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpErrorsTotal = new client.Counter({
  name: "sentinel_http_errors_total",
  help: "Total number of HTTP errors",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const activeRequests = new client.Gauge({
  name: "sentinel_active_requests",
  help: "Number of currently active requests",
  registers: [register],
});

export const sloLatencyViolationTotal = new client.Counter({
  name: "sentinel_slo_latency_violation_total",
  help: "Total number of requests violating latency SLO",
  labelNames: ["method", "route"],
  registers: [register],
});

export const sloErrorViolationTotal = new client.Counter({
  name: "sentinel_slo_error_violation_total",
  help: "Total number of requests violating error rate SLO (5xx)",
  labelNames: ["method", "route"],
  registers: [register],
});

import { pressureMonitor } from "./pressure/pressureMonitor";
import { globalPressure } from "./pressure/globalPressure";
import { protectionPolicy, ProtectionMode } from "./pressure/protectionMode";

export default async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get("/metrics", async (req, reply) => {
    // Update gauges
    pressureLocal.set(pressureMonitor.getPressure());
    pressureGlobal.set(globalPressure.getGlobalPressure());

    const mode = protectionPolicy.getMode();
    const modeValue = {
      [ProtectionMode.NORMAL]: 0,
      [ProtectionMode.MODERATE]: 1,
      [ProtectionMode.AGGRESSIVE]: 2,
      [ProtectionMode.CRITICAL]: 3,
    }[mode];
    protectionModeMetric.set(modeValue);

    reply.header("Content-Type", register.contentType);
    return register.metrics();
  });
}
