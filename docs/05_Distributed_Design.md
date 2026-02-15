# Sentinel -- Adaptive Distributed Load Control Microservice

## 05_Distributed_Design.md

------------------------------------------------------------------------

## 1. Purpose

This document explains the distributed systems design decisions behind
Sentinel.

It focuses on:

-   State management strategy
-   Consistency model
-   Coordination mechanisms
-   Failure tolerance
-   Scaling behavior

This is the architectural backbone of the system.

------------------------------------------------------------------------

## 2. Distributed Architecture Overview

Sentinel operates as multiple stateless pods in a Kubernetes cluster.

Key distributed components:

-   Sentinel Pods (N replicas)
-   Redis Cluster (shared coordination state)
-   Downstream Services
-   Prometheus (metrics aggregation)

Pods communicate indirectly through Redis.

------------------------------------------------------------------------

## 3. Hybrid State Strategy

Sentinel uses a hybrid state model:

### 3.1 Local State (Per Pod)

Stored in memory:

-   Rolling RPS buffer
-   Local pressure score
-   Short-term token buckets
-   Cached global pressure snapshot
-   Cached breaker state

Advantages: - Fast decision making - Reduced Redis latency dependency

Limitations: - Volatile - Must not hold critical authoritative state

------------------------------------------------------------------------

### 3.2 Shared Distributed State (Redis)

Stored in Redis:

-   Sliding window counters
-   Global pressure aggregate
-   Circuit breaker states
-   Tenant usage data
-   Pub/Sub channels

Redis acts as coordination layer.

------------------------------------------------------------------------

## 4. Consistency Model

Sentinel follows:

Eventual Consistency with bounded staleness.

Properties:

-   Decisions may briefly differ across pods
-   Synchronization interval kept short (\<1 second)
-   Critical breaker state synchronized immediately via Pub/Sub
-   Rate limit counters atomic via Lua scripts

Trade-off: Low latency prioritized over strict global consistency.

------------------------------------------------------------------------

## 5. Coordination Mechanisms

### 5.1 Atomic Counters

Redis Lua scripts ensure:

-   Sliding window cleanup
-   Counter increment
-   Count retrieval

All operations atomic.

------------------------------------------------------------------------

### 5.2 Pub/Sub Synchronization

Used for:

-   Circuit breaker state updates
-   Global pressure broadcast

Flow:

1.  Pod detects breaker trigger
2.  Publishes state change
3.  All pods update local state immediately

------------------------------------------------------------------------

### 5.3 Global Pressure Aggregation

Each pod:

-   Calculates local pressure
-   Writes to Redis key
-   Global pressure computed as rolling average

Pods cache global pressure locally.

------------------------------------------------------------------------

## 6. Failure Handling Strategy

### 6.1 Pod Crash

-   No critical state lost
-   New pod joins cluster
-   Reads global state from Redis
-   Begins participating immediately

------------------------------------------------------------------------

### 6.2 Redis Partial Failure

Mitigation:

-   Retry with exponential backoff
-   Fallback to conservative local limits
-   Temporarily reduce traffic
-   Avoid unlimited allowance

------------------------------------------------------------------------

### 6.3 Downstream Failure

-   Failure count tracked locally
-   Breaker state updated globally
-   All pods transition breaker state

Prevents cascading failures.

------------------------------------------------------------------------

## 7. Scaling Model

Horizontal scaling assumptions:

-   Pods can increase dynamically via HPA
-   New pods fetch state snapshot on startup
-   No sticky sessions
-   Stateless design guarantees safe scaling

Redis remains single coordination bottleneck but minimized via:

-   Local caching
-   Pipelining
-   Reduced per-request writes

------------------------------------------------------------------------

## 8. Partition Tolerance

In network partition scenarios:

-   Local state used temporarily
-   Conservative throttling applied
-   System favors stability over availability

Sentinel prioritizes resilience over maximum throughput.

------------------------------------------------------------------------

## 9. Idempotency Guarantees

All distributed writes:

-   Based on timestamped operations
-   Sliding window operations safe for retries
-   Breaker transitions validated before update

Ensures no corruption under retry storms.

------------------------------------------------------------------------

## 10. Trade-Off Analysis

### Why Redis Instead of In-Memory Cluster?

Pros: - Simpler coordination - Strong atomic operations - High
performance

Cons: - External dependency - Single coordination layer

------------------------------------------------------------------------

### Why Eventual Consistency?

Strict consistency would:

-   Increase latency
-   Reduce throughput
-   Require distributed consensus (overkill)

Eventual consistency is sufficient for load control.

------------------------------------------------------------------------

## 11. Distributed Guarantees Provided

Sentinel guarantees:

-   Cluster-wide synchronized breaker state
-   Bounded inconsistency in rate limiting
-   Safe horizontal scaling
-   No single pod becomes authoritative bottleneck
-   Graceful degradation during coordination issues

------------------------------------------------------------------------

## 12. Engineering Complexity Summary

This distributed design addresses:

-   Concurrency control
-   State synchronization
-   Partial failures
-   High availability
-   Horizontal scalability
-   Performance vs consistency trade-offs

It reflects production-grade distributed systems thinking.

------------------------------------------------------------------------

## 13. Summary

Sentinel's distributed design balances:

-   Performance
-   Consistency
-   Resilience
-   Scalability

By combining local intelligence with shared coordination via Redis, it
achieves adaptive load control suitable for cloud-native environments.
