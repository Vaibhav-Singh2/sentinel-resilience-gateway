import { FastifyInstance } from "fastify";
import client from "prom-client";

// Create a Registry
const register = new client.Registry();

// Add default metrics (cpu, memory, etc.)
client.collectDefaultMetrics({ register });

// Define custom metrics
export const requestTotal = new client.Counter({
  name: "sentinel_request_total",
  help: "Total number of requests",
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

export default async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get("/metrics", async (req, reply) => {
    reply.header("Content-Type", register.contentType);
    return register.metrics();
  });
}
