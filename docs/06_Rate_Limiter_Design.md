# Sentinel -- Adaptive Distributed Load Control Microservice

## 06_Rate_Limiter_Design.md

------------------------------------------------------------------------

## 1. Purpose

This document defines the complete rate limiting strategy used in
Sentinel.

It explains:

-   Algorithm selection
-   Distributed coordination model
-   Burst handling
-   Atomic operations
-   Performance considerations
-   Trade-offs

Sentinel implements a hybrid distributed sliding window + token bucket
model.

------------------------------------------------------------------------

## 2. Design Goals

The rate limiter must:

-   Work correctly across multiple pods
-   Provide fair tenant isolation
-   Allow short bursts
-   Prevent abuse under sustained load
-   Operate in \<5ms decision time
-   Avoid Redis bottlenecks

------------------------------------------------------------------------

## 3. Why Sliding Window (Not Fixed Window)

### Fixed Window Problem

If limit = 100 req/min:

User can send: - 100 requests at 00:59 - 100 requests at 01:00

Total = 200 requests in 1 second.

This creates burst vulnerability.

------------------------------------------------------------------------

### Sliding Window Advantage

Sliding window evaluates requests within:

(now - window_size) → now

This smooths traffic and eliminates boundary spikes.

------------------------------------------------------------------------

## 4. Distributed Sliding Window Design

### Data Structure

Redis Sorted Set:

Key: rate:{tenant_id}

Value: score = timestamp member = unique request ID

------------------------------------------------------------------------

### Atomic Lua Script

Each request executes:

1.  Remove expired entries: ZREMRANGEBYSCORE key 0 (now - window)
2.  Add current request: ZADD key now request_id
3.  Count: ZCARD key
4.  Compare with limit

All wrapped in single Lua script to ensure atomicity.

------------------------------------------------------------------------

## 5. Token Bucket Burst Control (Local Layer)

Purpose: Reduce Redis calls and allow short bursts.

Each pod maintains local bucket:

Variables: - tokens - refill_rate - capacity - last_refill_timestamp

Algorithm:

tokens += refill_rate × time_delta\
if tokens \> capacity → cap\
if tokens \>= 1 → allow\
else → fallback to Redis check

This enables fast-path approvals.

------------------------------------------------------------------------

## 6. Hybrid Flow

Request arrives:

1.  Local token bucket check
2.  If allowed locally → approve immediately
3.  If bucket empty → Redis sliding window check
4.  If Redis count \< global limit → allow
5.  Else → reject or delay

This minimizes Redis overhead.

------------------------------------------------------------------------

## 7. Rate Limit Calculation

Base Limit per Tenant:

limit = BASE_LIMIT × plan_multiplier

Plan Multipliers:

PREMIUM = 3\
STANDARD = 2\
FREE = 1

Then apply pressure factor:

effective_limit = limit × (1 - pressure_score)

------------------------------------------------------------------------

## 8. Pressure-Aware Adjustment

If pressure_score \> 0.8:

-   Reduce effective_limit by 30%
-   Disable burst allowance
-   Enforce stricter Redis checks

If pressure_score \> 0.9:

-   Block FREE tenants entirely
-   Allow only PREMIUM

------------------------------------------------------------------------

## 9. Redis Key Schema

rate:{tenant_id} rate:global pressure:global breaker:{service}

All keys TTL-controlled to avoid memory leak.

------------------------------------------------------------------------

## 10. Performance Optimizations

-   Use pipelining for batch operations
-   Cache limit config in memory
-   Use Redis connection pooling
-   Avoid synchronous JSON parsing
-   Use numeric timestamps (ms precision)

------------------------------------------------------------------------

## 11. Edge Cases

### Clock Drift

All timestamps derived from system clock. Small drift acceptable due to
short window duration.

------------------------------------------------------------------------

### Redis Latency Spike

Fallback: - Use conservative local limits - Reduce burst capacity
temporarily

------------------------------------------------------------------------

### Retry Storm

Ensure idempotent request IDs. Prevent duplicate increments.

------------------------------------------------------------------------

## 12. Complexity Analysis

Sliding window operation:

Time complexity: O(log N) per ZADD

Cleanup cost: O(M) for expired entries

Bounded by window size.

------------------------------------------------------------------------

## 13. Trade-Offs

Pros: - Accurate distributed limiting - Burst-friendly -
Pressure-aware - Cluster-consistent

Cons: - Redis dependency - Slight memory overhead - Eventual consistency
window

------------------------------------------------------------------------

## 14. Success Criteria

Rate limiter is considered correct if:

-   No tenant exceeds configured RPS under sustained load
-   Premium tenants maintain throughput during spikes
-   No boundary burst vulnerability exists
-   System remains stable at 10x traffic spike

------------------------------------------------------------------------

## 15. Summary

The Sentinel rate limiter combines:

-   Distributed sliding window precision
-   Local burst buffering
-   Pressure-aware dynamic adjustment
-   Atomic Redis coordination

This provides production-grade distributed traffic control suitable for
horizontally scaled Kubernetes environments.
