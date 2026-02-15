import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "./config";
import { logger } from "./logger";
import {
  requestForwardedTotal,
  requestTimeoutTotal,
  localBucketAllowedTotal,
  localBucketRejectedTotal,
  distributedAllowedTotal,
  distributedRejectedTotal,
  redisLatencyHistogram,
} from "./metrics";
import { TokenBucket } from "./limiter/tokenBucket";
import { distributedLimiter } from "./limiter/distributedLimiter";

const tokenBucket = new TokenBucket(config.burstCapacity, config.refillRate);

export default async function proxyRoutes(fastify: FastifyInstance) {
  fastify.all("*", async (req: FastifyRequest, reply: FastifyReply) => {
    // Avoid double-forwarding health/metrics if they matched earlier routes
    // Fastify handles route order, but wildcard * catches everything not matched.
    // Ensure this plugin is registered AFTER health/metrics.

    const requestId = req.id;
    const method = req.method;
    const tenantId =
      (req.headers[config.tenantHeader] as string) || "anonymous";

    // 1. Local Token Bucket Check (Fast Path)
    if (!tokenBucket.allow(tenantId)) {
      logger.warn(
        { event: "local_rate_limit", tenantId, requestId },
        "Rate limit exceeded (local)",
      );
      localBucketRejectedTotal.inc({ tenant_id: tenantId });
      return reply.code(429).send({
        error: "rate_limited",
        reason: "local_burst_exceeded",
      });
    }

    localBucketAllowedTotal.inc({ tenant_id: tenantId });

    // 2. Distributed Rate Limit Check (Redis)
    const redisStart = performance.now();
    const allowedDistributed = await distributedLimiter.checkDistributedLimit(
      tenantId,
      requestId as string,
    );
    const redisDuration = performance.now() - redisStart;
    redisLatencyHistogram.observe({ operation: "check_limit" }, redisDuration);

    if (!allowedDistributed) {
      logger.warn(
        {
          event: "distributed_rate_limit",
          tenantId,
          requestId,
          limit: config.baseRateLimit,
          windowMs: config.windowMs,
        },
        "Rate limit exceeded (distributed)",
      );
      distributedRejectedTotal.inc({ tenant_id: tenantId });
      return reply.code(429).send({
        error: "rate_limited",
        reason: "distributed_limit_exceeded",
      });
    }

    distributedAllowedTotal.inc({ tenant_id: tenantId });

    // Construct downstream URL
    // Remove query string from req.url because fetch handles it?
    // req.url includes query string.
    const downstreamUrl = `${config.downstreamUrl}${req.url}`;

    logger.info(
      { requestId, method, url: req.url, downstreamUrl },
      "Proxying request",
    );
    requestForwardedTotal.inc({ method, upstream_url: config.downstreamUrl });

    // Setup AbortController for cancellation
    const controller = new AbortController();
    const timeoutDesc = setTimeout(() => {
      controller.abort("Timeout");
    }, config.requestTimeoutMs);

    // Cancel upstream request if client disconnects
    req.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        logger.info(
          { requestId },
          "Client disconnected, aborting upstream request",
        );
        controller.abort("ClientDisconnect");
        clearTimeout(timeoutDesc);
      }
    });

    try {
      // Prepare headers
      const headers = new Headers();
      const rawHeaders = req.headers;
      for (const key in rawHeaders) {
        const val = rawHeaders[key];
        if (val === undefined) continue;
        if (Array.isArray(val)) {
          val.forEach((v) => headers.append(key, v));
        } else {
          headers.append(key, val as string);
        }
      }

      // Cleanup headers
      headers.delete("host");
      headers.delete("connection");
      headers.delete("transfer-encoding");

      // Forward Request
      // Use req.raw (Node stream) as body. Bun fetch handles this.
      const response = await fetch(downstreamUrl, {
        method,
        headers,
        body: method !== "GET" && method !== "HEAD" ? req.raw : undefined,
        signal: controller.signal,
        // duplicate-duplex option might be needed for some node streams in Bun?
        // Usually works out of box.
      } as any);

      clearTimeout(timeoutDesc);

      // Forward Response
      reply.code(response.status);

      // Copy headers
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      // Remove problematic headers
      reply.removeHeader("transfer-encoding");
      reply.removeHeader("content-encoding");
      reply.removeHeader("connection");

      // Stream response
      if (response.body) {
        return reply.send(response.body);
      } else {
        return reply.send();
      }
    } catch (err: any) {
      clearTimeout(timeoutDesc);

      // Check for AbortError
      if (err.name === "AbortError" || controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason === "Timeout") {
          logger.error({ requestId }, "Upstream timeout");
          requestTimeoutTotal.inc({ method });
          return reply.code(504).send({ error: "upstream_timeout" });
        } else if (reason === "ClientDisconnect") {
          // Already logged
          return;
        }
      }

      logger.error({ requestId, err }, "Proxy error");
      return reply.code(502).send({ error: "bad_gateway" });
    }
  });
}
