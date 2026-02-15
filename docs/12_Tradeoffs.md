# Sentinel -- Adaptive Distributed Load Control Microservice

## 12_Tradeoffs.md

------------------------------------------------------------------------

## 1. Purpose

This document records major architectural decisions made during the
design of Sentinel, along with alternatives considered, trade-offs, and
rationale.

This log demonstrates intentional engineering thinking and decision
transparency.

------------------------------------------------------------------------

## 2. Decision: Hybrid State (Local + Redis)

### Options Considered

1.  Fully Local (No Shared State)
2.  Fully Centralized (Redis-only)
3.  Hybrid (Local fast-path + Redis coordination)

### Chosen: Hybrid

### Why

-   Local state enables \<5ms decisions
-   Redis ensures cluster-wide consistency
-   Reduces Redis bottleneck risk
-   Balances performance with coordination

### Trade-Off

-   Eventual consistency window
-   Increased design complexity

------------------------------------------------------------------------

## 3. Decision: Sliding Window vs Fixed Window

### Options

1.  Fixed Window
2.  Sliding Window
3.  Leaky Bucket

### Chosen: Sliding Window

### Why

-   Eliminates boundary burst vulnerability
-   Provides smoother traffic enforcement
-   More precise distributed control

### Trade-Off

-   Higher Redis memory usage
-   Slightly higher complexity (Lua scripts)

------------------------------------------------------------------------

## 4. Decision: HTTP Reverse Proxy vs gRPC

### Options

1.  HTTP Reverse Proxy
2.  gRPC Middleware
3.  Sidecar (Service Mesh Style)

### Chosen: HTTP Reverse Proxy

### Why

-   Simpler integration
-   Broad compatibility
-   Easier testing with load tools
-   Lower entry barrier

### Trade-Off

-   Slightly higher overhead than gRPC
-   Not as low-latency as binary protocol

------------------------------------------------------------------------

## 5. Decision: Eventual Consistency vs Strong Consistency

### Options

1.  Distributed Consensus (Raft-style)
2.  Eventual Consistency with Redis
3.  Centralized Single Authority

### Chosen: Eventual Consistency

### Why

-   Load control tolerates small inconsistencies
-   Strong consistency increases latency
-   Avoids complex distributed consensus

### Trade-Off

-   Brief state divergence possible across pods

------------------------------------------------------------------------

## 6. Decision: Redis as Coordination Layer

### Alternatives

1.  In-memory clustering
2.  Kafka/NATS streaming
3.  Distributed database
4.  Redis

### Chosen: Redis

### Why

-   Atomic operations (Lua)
-   Fast in-memory performance
-   Built-in Pub/Sub
-   Mature ecosystem

### Trade-Off

-   External dependency
-   Requires HA configuration

------------------------------------------------------------------------

## 7. Decision: Kubernetes HPA for Scaling

### Options

1.  Manual scaling
2.  Custom auto-scaler logic
3.  Kubernetes HPA

### Chosen: HPA

### Why

-   Native Kubernetes integration
-   Reliable scaling mechanism
-   Production-ready

### Trade-Off

-   Dependent on metrics server
-   CPU-based scaling may not reflect full load picture

------------------------------------------------------------------------

## 8. Decision: Pressure-Based Adaptive Model

### Alternatives

1.  Static rate limiting only
2.  Simple threshold-based rejection
3.  Weighted adaptive pressure model

### Chosen: Weighted adaptive model

### Why

-   Real-time system awareness
-   Smooth degradation
-   Prevents collapse during spikes

### Trade-Off

-   Requires tuning weights
-   Risk of oscillation if poorly configured

------------------------------------------------------------------------

## 9. Decision: Circuit Breaker with Pub/Sub Sync

### Alternatives

1.  Local-only breaker
2.  Centralized breaker authority
3.  Distributed sync via Pub/Sub

### Chosen: Distributed Pub/Sub

### Why

-   Fast propagation across pods
-   Minimal overhead
-   Avoids single point of control

### Trade-Off

-   Requires Redis availability
-   Slight propagation delay possible

------------------------------------------------------------------------

## 10. Decision: Local Deployment but Cloud-Ready Design

### Alternatives

1.  Build only for local demo
2.  Deploy directly to cloud
3.  Local cluster with cloud-ready architecture

### Chosen: Local with cloud-native design

### Why

-   Cost-effective
-   Mirrors production setup
-   Demonstrates architectural maturity

### Trade-Off

-   Does not test real cloud network conditions
-   Limited multi-region validation

------------------------------------------------------------------------

## 11. Performance vs Complexity Trade-Off

Sentinel prioritizes:

-   Resilience
-   Adaptive behavior
-   Horizontal scalability

At the cost of:

-   Increased system complexity
-   Larger documentation footprint
-   More tuning requirements

This complexity is intentional to simulate real infrastructure
engineering.

------------------------------------------------------------------------

## 12. Risk Areas Identified

-   Redis becoming bottleneck
-   Misconfigured pressure weights
-   Improper threshold tuning
-   Excessive throttling under false signals
-   Oscillation between protection modes

Mitigation:

-   Observability dashboards
-   Load testing validation
-   Conservative default configuration

------------------------------------------------------------------------

## 13. Summary

Sentinel's architecture reflects deliberate trade-offs between:

-   Performance and consistency
-   Simplicity and resilience
-   Latency and coordination
-   Precision and scalability

These decisions collectively create a distributed, adaptive,
cloud-native load control system suitable for production-grade
environments.
