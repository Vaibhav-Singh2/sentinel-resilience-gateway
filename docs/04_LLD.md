# Sentinel -- Adaptive Distributed Load Control Microservice

## 04_LLD.md (Low-Level Design Document)

------------------------------------------------------------------------

## 1. Introduction

This document defines the detailed internal structure, modules, data
flow, algorithms, and component-level responsibilities of the Sentinel
microservice.

It translates the High-Level Design into implementable engineering
components.

------------------------------------------------------------------------

## 2. Module Breakdown

### 2.1 Proxy Module (`/proxy`)

Responsibilities: - Accept HTTP requests - Extract headers and tenant
identity - Stream requests to downstream service - Stream responses back
to client - Enforce timeouts using AbortController - Attach metrics
instrumentation

Key Design Notes: - Must be fully streaming (no full-body buffering) -
Must avoid blocking event loop - Must handle connection cancellation
gracefully

------------------------------------------------------------------------

### 2.2 Decision Engine (`/engine`)

Responsibilities: - Orchestrates full decision workflow - Calls rate
limiter - Fetches local pressure score - Checks circuit breaker -
Applies priority scheduling - Returns final decision enum

Decision Enum: - ALLOW - REJECT - DELAY - DEGRADE

Execution Target: \< 5ms per request under normal conditions

------------------------------------------------------------------------

### 2.3 Rate Limiter Module (`/limiter`)

Responsibilities: - Sliding window request counting - Token bucket burst
control - Redis coordination for cluster-wide limits

Core Data Structures: - Redis Sorted Sets (timestamp-based window) -
Local in-memory token bucket map - Tenant-based key schema

Redis Key Example: `rate:{tenant_id}`

Atomic operations implemented using Lua scripts.

------------------------------------------------------------------------

### 2.4 Pressure Monitor (`/pressure`)

Responsibilities: - Calculate local CPU usage - Track memory
utilization - Monitor event loop lag - Compute rolling RPS - Normalize
pressure score (0 to 1)

Formula Example:

pressure = (0.4 × cpu) + (0.3 × memory) + (0.2 × queue_ratio) + (0.1 ×
error_rate)

Local score synced periodically with Redis.

------------------------------------------------------------------------

### 2.5 Circuit Breaker Module (`/breaker`)

Responsibilities: - Maintain state machine (CLOSED / OPEN / HALF_OPEN) -
Track failure count per downstream service - Trigger breaker
transitions - Publish state change via Redis Pub/Sub

Breaker States:

CLOSED → normal traffic\
OPEN → block traffic\
HALF_OPEN → limited test traffic

Redis Key Example: `breaker:{service_name}`

------------------------------------------------------------------------

### 2.6 Scheduler Module (`/scheduler`)

Responsibilities: - Assign weight based on tenant plan - Apply weighted
fair queuing logic - Preempt low-priority traffic under high pressure

Tenant Priority Levels: - PREMIUM (weight 3) - STANDARD (weight 2) -
FREE (weight 1)

Effective rate limit adjusted using priority multiplier.

------------------------------------------------------------------------

### 2.7 Redis Coordination Module (`/redis`)

Responsibilities: - Maintain Redis connection pool - Provide atomic Lua
execution wrapper - Subscribe to breaker channels - Cache global state
snapshot - Handle reconnect logic

Must ensure: - Retry with exponential backoff - Fail-safe behavior if
Redis temporarily unavailable

------------------------------------------------------------------------

### 2.8 Metrics Module (`/metrics`)

Responsibilities: - Expose `/metrics` endpoint - Track counters: -
request_total - request_allowed - request_rejected -
circuit_open_events - pressure_score - Provide latency histogram

Compatible with Prometheus scraping.

------------------------------------------------------------------------

## 3. Data Flow per Request

1.  Proxy receives request
2.  Extract tenant metadata
3.  Decision Engine invoked
4.  Local burst check
5.  Redis sliding window check
6.  Pressure evaluation
7.  Circuit breaker check
8.  Decision returned
9.  Proxy forwards or rejects
10. Metrics updated

------------------------------------------------------------------------

## 4. Failure Handling Logic

### 4.1 Downstream Timeout

-   Increment failure counter
-   Evaluate breaker threshold
-   Transition to OPEN if exceeded

### 4.2 Redis Latency Spike

-   Use local fallback limits
-   Reduce global coordination temporarily

### 4.3 Pod Termination

-   Stateless design ensures safe termination
-   In-flight requests handled gracefully

------------------------------------------------------------------------

## 5. Concurrency Considerations

-   Avoid blocking I/O
-   Use async/await carefully
-   No synchronous loops over large datasets
-   Redis calls pipelined where possible
-   Atomic Lua scripts prevent race conditions

------------------------------------------------------------------------

## 6. Folder Structure

    src/
      proxy/
      engine/
      limiter/
      breaker/
      scheduler/
      pressure/
      redis/
      metrics/
      utils/

------------------------------------------------------------------------

## 7. Configuration Management

Environment Variables:

-   REDIS_HOST
-   REDIS_PORT
-   DOWNSTREAM_SERVICE_URL
-   BASE_RATE_LIMIT
-   PRESSURE_SYNC_INTERVAL
-   CIRCUIT_BREAKER_THRESHOLD

No hardcoded configuration allowed.

------------------------------------------------------------------------

## 8. Key Engineering Guarantees

-   Stateless per pod
-   Idempotent decision logic
-   Bounded decision latency
-   Safe distributed coordination
-   Graceful degradation under stress

------------------------------------------------------------------------

## 9. Summary

The Low-Level Design specifies the internal structure of Sentinel and
provides a clear blueprint for implementation.

Each module has a defined responsibility, enabling modular testing,
scalability, and maintainability in distributed Kubernetes environments.
