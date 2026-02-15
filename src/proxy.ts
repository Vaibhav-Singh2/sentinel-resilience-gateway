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
  protectionModeMetric,
  tenantRequestTotal,
  priorityDropsTotal,
  degradedResponseTotal,
  premiumPreservedTotal,
} from "./metrics";
import { TokenBucket } from "./limiter/tokenBucket";
import { distributedLimiter } from "./limiter/distributedLimiter";
import { pressureMonitor } from "./pressure/pressureMonitor";
import { protectionPolicy, ProtectionMode } from "./pressure/protectionMode";
import { globalPressure } from "./pressure/globalPressure";
import { circuitBreaker } from "./breaker/circuitBreaker";
import {
  getTenantPlan,
  TenantPlan,
  PLAN_MULTIPLIERS,
} from "./scheduler/tenantPlan";
import { priorityScheduler } from "./scheduler/priorityScheduler";
import { isHeavyEndpoint, getDegradedResponse } from "./utils/degrade";

const tokenBucket = new TokenBucket(config.burstCapacity, config.refillRate);

export default async function proxyRoutes(fastify: FastifyInstance) {
  fastify.all("*", async (req: FastifyRequest, reply: FastifyReply) => {
    // Report request to pressure monitor
    pressureMonitor.reportRequest();

    const requestId = req.id;
    const method = req.method;
    const tenantId =
      (req.headers[config.tenantHeader] as string) || "anonymous";

    // 0. Extract Tenant Plan
    const plan = getTenantPlan(req.headers);
    tenantRequestTotal.inc({ plan });

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

    // Calculate adaptive limit with Plan Multiplier
    const currentGlobalPressure = globalPressure.getGlobalPressure();
    const planMultiplier = PLAN_MULTIPLIERS[plan];
    const adaptiveLimit = distributedLimiter.getAdaptiveLimit(
      currentGlobalPressure,
      planMultiplier,
    );

    const allowedDistributed = await distributedLimiter.checkDistributedLimit(
      tenantId,
      requestId as string,
      adaptiveLimit,
    );
    const redisDuration = performance.now() - redisStart;
    redisLatencyHistogram.observe({ operation: "check_limit" }, redisDuration);

    if (!allowedDistributed) {
      logger.warn(
        {
          event: "distributed_rate_limit",
          tenantId,
          requestId,
          limit: adaptiveLimit,
          windowMs: config.windowMs,
          pressure: currentGlobalPressure,
          plan,
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

    // 3. Priority Scheduler & Protection Mode Check
    if (!priorityScheduler.shouldAllow(tenantId, plan)) {
      const mode = protectionPolicy.getMode();
      priorityDropsTotal.inc({ plan, mode });
      return reply
        .code(503)
        .send({ error: "load_shedding", reason: "priority_throttle", plan });
    }

    // 4. Circuit Breaker Check
    // Service name defaults to hostname of downstream or fixed "default"
    const serviceName = "backend-service";

    if (!circuitBreaker.check(serviceName)) {
      logger.warn(
        { event: "circuit_breaker_open", serviceName, requestId },
        "Circuit breaker open, blocking request",
      );
      return reply
        .code(503)
        .send({ error: "circuit_open", service: serviceName });
    }

    // 5. Protection Mode (Redundant block check is likely handled by Scheduler, but check Degraded Response)
    if (
      (protectionPolicy.getMode() === ProtectionMode.AGGRESSIVE ||
        protectionPolicy.getMode() === ProtectionMode.CRITICAL) &&
      isHeavyEndpoint(req.url)
    ) {
      logger.info(
        { event: "degraded_response", requestId, url: req.url },
        "Returning degraded response",
      );
      degradedResponseTotal.inc();
      return reply.send(getDegradedResponse(req.url));
    }

    // Log Premium Preservation
    if (plan === TenantPlan.PREMIUM && currentGlobalPressure > 0.7) {
      premiumPreservedTotal.inc({ tenant_id: tenantId });
      logger.debug(
        { event: "premium_preserved", tenantId },
        "Premium request preserved under pressure",
      );
    }

    // Construct downstream URL
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
      const response = await fetch(downstreamUrl, {
        method,
        headers,
        body: method !== "GET" && method !== "HEAD" ? req.raw : undefined,
        signal: controller.signal,
      } as any);

      clearTimeout(timeoutDesc);

      // Forward Response
      reply.code(response.status);

      if (response.status >= 500) {
        circuitBreaker.recordFailure("backend-service");
      } else {
        circuitBreaker.recordSuccess("backend-service");
      }

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
          circuitBreaker.recordFailure("backend-service");
          return reply.code(504).send({ error: "upstream_timeout" });
        } else if (reason === "ClientDisconnect") {
          // Already logged
          return;
        }
      }

      logger.error({ requestId, err }, "Proxy error");
      pressureMonitor.reportError();
      circuitBreaker.recordFailure("backend-service");
      return reply.code(502).send({ error: "bad_gateway" });
    }
  });
}
