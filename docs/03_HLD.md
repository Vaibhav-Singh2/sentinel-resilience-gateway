# Sentinel -- Adaptive Distributed Load Control Microservice

## 03_HLD.md (High-Level Design Document)

------------------------------------------------------------------------

## 1. System Overview

Sentinel is a horizontally scalable HTTP reverse-proxy microservice that
provides adaptive distributed load control for backend systems.

It sits between clients (or API gateways) and downstream services and
performs:

-   Distributed rate limiting
-   Adaptive pressure-based throttling
-   Priority scheduling
-   Cluster-synchronized circuit breaking
-   Intelligent load shedding
-   Observability and metrics exposure

Sentinel is designed to be cloud-native and Kubernetes-ready.

------------------------------------------------------------------------

## 2. High-Level Architecture

### Core Components

1.  **HTTP Reverse Proxy Layer**
    -   Accepts incoming requests
    -   Streams requests to downstream services
    -   Streams responses back to client
    -   Enforces timeout and abort signals
2.  **Decision Engine**
    -   Applies rate limiting logic
    -   Evaluates pressure score
    -   Applies tenant priority rules
    -   Checks circuit breaker state
    -   Determines: ALLOW / REJECT / DELAY / DEGRADE
3.  **Local Adaptive Brain (In-Memory)**
    -   Rolling RPS window
    -   Local pressure score
    -   Short burst buffer (token bucket)
    -   Cached global state snapshot
4.  **Distributed Coordination Layer (Redis)**
    -   Global request counters
    -   Tenant usage tracking
    -   Circuit breaker states
    -   Pub/Sub synchronization
    -   Global pressure state
5.  **Observability Layer**
    -   Prometheus metrics endpoint
    -   Structured logging
    -   Latency histograms
    -   Rejection counters

------------------------------------------------------------------------

## 3. Deployment Model

Sentinel runs as:

-   Multiple Kubernetes pods
-   Stateless instances
-   Coordinated via Redis Cluster
-   Horizontally scaled via HPA

Deployment includes:

-   Deployment YAML
-   Service (ClusterIP)
-   HPA (CPU or custom metrics)
-   ConfigMaps and Secrets
-   Liveness and Readiness Probes

------------------------------------------------------------------------

## 4. Request Lifecycle

1.  Client sends HTTP request
2.  Sentinel receives request
3.  Extract tenant identity and priority
4.  Check local burst allowance
5.  Check distributed rate limit (Redis)
6.  Evaluate pressure score
7.  Check circuit breaker state
8.  Decision:
    -   Forward request
    -   Delay request
    -   Reject (429)
    -   Degrade response
9.  Collect metrics
10. Return response to client

------------------------------------------------------------------------

## 5. Scaling Model

Sentinel scales horizontally based on:

-   CPU utilization
-   Request queue length
-   Custom Prometheus metrics (optional)

Key properties:

-   No sticky sessions
-   Stateless pods
-   Shared coordination via Redis
-   Idempotent decision logic
-   Safe pod termination handling

------------------------------------------------------------------------

## 6. Distributed Coordination Strategy

Redis is used for:

-   Atomic sliding window rate limiting (Lua scripts)
-   Global pressure value aggregation
-   Circuit breaker state propagation
-   Pub/Sub event broadcasting

All coordination is eventual-consistent but bounded by short
synchronization intervals.

------------------------------------------------------------------------

## 7. Fault Tolerance Model

Sentinel tolerates:

-   Pod crashes
-   Pod scaling events
-   Downstream service failures
-   Temporary Redis latency spikes
-   Network partitions (best-effort consistency)

Critical design properties:

-   No critical state stored only in memory
-   Safe retry behavior
-   Timeout enforcement
-   Circuit breaker synchronization

------------------------------------------------------------------------

## 8. External Dependencies

-   Redis Cluster
-   Kubernetes
-   Prometheus
-   Grafana
-   Downstream backend services

------------------------------------------------------------------------

## 9. Non-Goals (Architecture Scope)

Sentinel does NOT:

-   Replace full-featured API gateways
-   Replace service meshes
-   Perform routing-based load balancing
-   Handle authentication/authorization
-   Provide TLS termination (optional)

Sentinel focuses exclusively on adaptive load intelligence.

------------------------------------------------------------------------

## 10. Architectural Principles

1.  Cloud-native by default
2.  Stateless and horizontally scalable
3.  Failure-aware and resilience-first
4.  Low-latency decision making
5.  Distributed coordination with minimal bottlenecks
6.  Observability-first design

------------------------------------------------------------------------

## 11. Expected High-Level Outcomes

-   Stable throughput under traffic spikes
-   Controlled degradation instead of system collapse
-   Coordinated cluster-wide breaker states
-   Fair tenant prioritization
-   Seamless scaling via Kubernetes HPA

------------------------------------------------------------------------

## 12. Summary

This High-Level Design defines Sentinel as a distributed adaptive
control layer designed to protect backend systems from overload while
maintaining fairness, resilience, and scalability in Kubernetes
environments.

It establishes the foundation for detailed module-level design (LLD) and
algorithm documentation.
