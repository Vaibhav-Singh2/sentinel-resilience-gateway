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
};

if (!process.env.DOWNSTREAM_URL) {
  console.warn("WARNING: DOWNSTREAM_URL not set, using default");
}
