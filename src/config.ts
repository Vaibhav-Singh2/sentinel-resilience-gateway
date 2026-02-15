import type { AppConfig } from "./types";

export const config: AppConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  downstreamUrl: process.env.DOWNSTREAM_URL || "http://localhost:8080",
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || "30000", 10),
  logLevel: process.env.LOG_LEVEL || "info",
  tenantHeader: process.env.TENANT_HEADER || "x-tenant-id",
  burstCapacity: parseInt(process.env.BURST_CAPACITY || "20", 10),
  refillRate: parseInt(process.env.REFILL_RATE || "10", 10),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  windowMs: parseInt(process.env.WINDOW_MS || "60000", 10),
  baseRateLimit: parseInt(process.env.BASE_RATE_LIMIT || "100", 10),
  podId: process.env.POD_ID || crypto.randomUUID(),
  breakerFailureThreshold: parseFloat(
    process.env.BREAKER_FAILURE_THRESHOLD || "0.5",
  ),
  breakerConsecutiveFailures: parseInt(
    process.env.BREAKER_CONSECUTIVE_FAILURES || "10",
    10,
  ),
  breakerCooldownMs: parseInt(process.env.BREAKER_COOLDOWN_MS || "30000", 10),
  breakerHalfOpenMaxRequests: parseInt(
    process.env.BREAKER_HALF_OPEN_MAX_REQUESTS || "5",
    10,
  ),
  enableTracing: process.env.ENABLE_TRACING === "true",
  otlpEndpoint: process.env.OTLP_ENDPOINT,
  sloLatencyThreshold: parseInt(process.env.SLO_LATENCY_THRESHOLD || "200", 10),
};

if (!process.env.DOWNSTREAM_URL) {
  console.warn("WARNING: DOWNSTREAM_URL not set, using default");
}
