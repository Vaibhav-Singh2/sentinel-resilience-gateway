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
import { getOrCreateCorrelationId } from "./observability/correlation";
import { getTracer } from "./observability/tracing";
import {
  SpanStatusCode,
  context,
  propagation,
  trace,
} from "@opentelemetry/api";
import {
  httpRequestsTotal,
  httpRequestDuration,
  httpErrorsTotal,
  activeRequests,
  sloLatencyViolationTotal,
  sloErrorViolationTotal,
} from "./metrics";

const tokenBucket = new TokenBucket(config.burstCapacity, config.refillRate);

export default async function proxyRoutes(fastify: FastifyInstance) {
  fastify.all("*", async (req: FastifyRequest, reply: FastifyReply) => {
    const start = performance.now();
    activeRequests.inc();

    // 0. Correlation ID
    const correlationId = getOrCreateCorrelationId(req);
    // Attach to logger child for this request
    const requestLogger = logger.child({ correlationId });

    // Start Trace Span
    const tracer = getTracer();
    const span = tracer?.startSpan("proxy_request");

    // Set initial attributes
    const tenantId =
      (req.headers[config.tenantHeader] as string) || "anonymous";
    const plan = getTenantPlan(req.headers);

    span?.setAttribute("tenant.id", tenantId);
    span?.setAttribute("tenant.plan", plan);
    span?.setAttribute("correlation.id", correlationId);
    span?.setAttribute("http.method", req.method);
    span?.setAttribute("http.url", req.url);

    // Create context with span
    const ctx = span ? trace.setSpan(context.active(), span) : context.active();

    try {
      // Report request
      pressureMonitor.reportRequest();
      tenantRequestTotal.inc({ plan });

      // 1. Local Token Bucket
      const tokenSpan = tracer?.startSpan("token_bucket_check", undefined, ctx);
      if (!tokenBucket.allow(tenantId)) {
        tokenSpan?.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Local rate limit exceeded",
        });
        tokenSpan?.end();

        requestLogger.warn(
          { event: "local_rate_limit", tenantId, requestId: req.id },
          "Rate limit exceeded (local)",
        );
        localBucketRejectedTotal.inc({ tenant_id: tenantId });
        httpRequestsTotal.inc({
          method: req.method,
          route: "proxy",
          status_code: 429,
        });
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Rate Limited",
        });
        return reply
          .code(429)
          .send({ error: "rate_limited", reason: "local_burst_exceeded" });
      }
      localBucketAllowedTotal.inc({ tenant_id: tenantId });
      tokenSpan?.end();

      // 2. Distributed Rate Limit
      const distSpan = tracer?.startSpan(
        "distributed_limiter_check",
        undefined,
        ctx,
      );
      const redisStart = performance.now();
      const currentGlobalPressure = globalPressure.getGlobalPressure();
      const planMultiplier = PLAN_MULTIPLIERS[plan];

      span?.setAttribute("sentinel.pressure.global", currentGlobalPressure);
      span?.setAttribute(
        "sentinel.protection.mode",
        protectionPolicy.getMode(),
      );

      const adaptiveLimit = distributedLimiter.getAdaptiveLimit(
        currentGlobalPressure,
        planMultiplier,
      );

      const allowedDistributed = await distributedLimiter.checkDistributedLimit(
        tenantId,
        req.id as string, // keep req.id for redis key if needed, or use correlationId? stick to req.id for now
        adaptiveLimit,
      );
      const redisDuration = performance.now() - redisStart;
      redisLatencyHistogram.observe(
        { operation: "check_limit" },
        redisDuration,
      );

      if (!allowedDistributed) {
        distSpan?.setStatus({ code: SpanStatusCode.ERROR });
        distSpan?.end();

        requestLogger.warn(
          {
            event: "distributed_rate_limit",
            tenantId,
            limit: adaptiveLimit,
            pressure: currentGlobalPressure,
            plan,
          },
          "Rate limit exceeded (distributed)",
        );
        distributedRejectedTotal.inc({ tenant_id: tenantId });
        httpRequestsTotal.inc({
          method: req.method,
          route: "proxy",
          status_code: 429,
        });
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Distributed Rate Limited",
        });
        return reply.code(429).send({
          error: "rate_limited",
          reason: "distributed_limit_exceeded",
        });
      }
      distributedAllowedTotal.inc({ tenant_id: tenantId });
      distSpan?.end();

      // 3. Priority Scheduler
      if (!priorityScheduler.shouldAllow(tenantId, plan)) {
        const mode = protectionPolicy.getMode();
        priorityDropsTotal.inc({ plan, mode });
        httpRequestsTotal.inc({
          method: req.method,
          route: "proxy",
          status_code: 503,
        });
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Priority Throttled",
        });
        return reply
          .code(503)
          .send({ error: "load_shedding", reason: "priority_throttle", plan });
      }

      // 4. Circuit Breaker
      const breakerSpan = tracer?.startSpan(
        "circuit_breaker_check",
        undefined,
        ctx,
      );
      const serviceName = "backend-service";
      if (!circuitBreaker.check(serviceName)) {
        breakerSpan?.setStatus({ code: SpanStatusCode.ERROR });
        breakerSpan?.end();

        requestLogger.warn(
          { event: "circuit_breaker_open", serviceName },
          "Circuit breaker open",
        );
        httpRequestsTotal.inc({
          method: req.method,
          route: "proxy",
          status_code: 503,
        });
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Circuit Breaker Open",
        });
        return reply
          .code(503)
          .send({ error: "circuit_open", service: serviceName });
      }
      breakerSpan?.end();

      // 5. Degraded Response
      if (
        (protectionPolicy.getMode() === ProtectionMode.AGGRESSIVE ||
          protectionPolicy.getMode() === ProtectionMode.CRITICAL) &&
        isHeavyEndpoint(req.url)
      ) {
        requestLogger.info(
          { event: "degraded_response" },
          "Returning degraded response",
        );
        degradedResponseTotal.inc();
        httpRequestsTotal.inc({
          method: req.method,
          route: "proxy",
          status_code: 200,
        });
        span?.setAttribute("sentinel.degraded", true);
        return reply.send(getDegradedResponse(req.url));
      }

      // 6. Forward Request
      const downstreamUrl = `${config.downstreamUrl}${req.url}`;
      requestLogger.info({ downstreamUrl }, "Proxying request");
      requestForwardedTotal.inc({
        method: req.method,
        upstream_url: config.downstreamUrl,
      });

      // Propagate Trace Context
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
      headers.set("x-request-id", correlationId);

      // Inject OpenTelemetry context
      if (span) {
        propagation.inject(ctx, headers, {
          set: (h, k, v) => h.set(k, v),
        });
      }

      // Cleanup
      headers.delete("host");
      headers.delete("connection");
      headers.delete("transfer-encoding");

      const controller = new AbortController();
      const timeoutDesc = setTimeout(() => {
        controller.abort("Timeout");
      }, config.requestTimeoutMs);

      req.raw.on("close", () => {
        if (!reply.raw.writableEnded) {
          logger.info("Client disconnected");
          controller.abort("ClientDisconnect");
          clearTimeout(timeoutDesc);
        }
      });

      // Downstream Span
      const downstreamSpan = tracer?.startSpan(
        "downstream_request",
        undefined,
        ctx,
      );
      const upstreamStart = performance.now();

      const response = await fetch(downstreamUrl, {
        method: req.method,
        headers,
        body:
          req.method !== "GET" && req.method !== "HEAD" ? req.raw : undefined,
        signal: controller.signal,
      } as any);

      const upstreamDuration = (performance.now() - upstreamStart) / 1000;
      clearTimeout(timeoutDesc);
      downstreamSpan?.end();

      reply.code(response.status);

      // SLO Tracking
      const durationSeconds = (performance.now() - start) / 1000;
      httpRequestDuration.observe(durationSeconds);
      httpRequestsTotal.inc({
        method: req.method,
        route: "proxy",
        status_code: response.status,
      });

      if (durationSeconds * 1000 > config.sloLatencyThreshold) {
        sloLatencyViolationTotal.inc({ method: req.method, route: "proxy" });
      }

      if (response.status >= 500) {
        sloErrorViolationTotal.inc({ method: req.method, route: "proxy" });
        httpErrorsTotal.inc({
          method: req.method,
          route: "proxy",
          status_code: response.status,
        });
        circuitBreaker.recordFailure("backend-service");
        span?.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        circuitBreaker.recordSuccess("backend-service");
        span?.setStatus({ code: SpanStatusCode.OK });
      }

      // Headers
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      reply.header("x-correlation-id", correlationId);
      reply.removeHeader("transfer-encoding");
      reply.removeHeader("content-encoding");
      reply.removeHeader("connection");

      if (response.body) {
        return reply.send(response.body);
      } else {
        return reply.send();
      }
    } catch (err: any) {
      requestLogger.error({ err }, "Proxy error");
      httpErrorsTotal.inc({
        method: req.method,
        route: "proxy",
        status_code: 502,
      });

      span?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });

      if (err.name === "AbortError" && err.cause === "Timeout") {
        // Check cause or whatever set abort
        // Need to check specific error from AbortController logic above if possible
        // The previous logic set controller.abort("Timeout") but err.message might simply be "The operation was aborted"
        // Using timeout checks or maintaining state is better.
      }

      // Simple error handling
      return reply.code(502).send({ error: "bad_gateway" });
    } finally {
      activeRequests.dec();
      span?.end();
    }
  });
}
