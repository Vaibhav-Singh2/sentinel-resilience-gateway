# Sentinel -- Adaptive Distributed Load Control Microservice

## 08_Circuit_Breaker.md

------------------------------------------------------------------------

## 1. Purpose

This document defines the distributed circuit breaker mechanism used by
Sentinel to prevent cascading failures in microservice environments.

The breaker ensures downstream instability does not propagate through
the system and collapse the entire cluster.

------------------------------------------------------------------------

## 2. Problem Context

In microservice systems:

-   Sentinel forwards traffic to downstream services
-   Downstream services may become slow or unavailable
-   Requests pile up
-   Timeouts increase
-   Threads and connections exhaust
-   Upstream systems destabilize

Without protection, failures cascade.

------------------------------------------------------------------------

## 3. Circuit Breaker Goals

The breaker must:

-   Detect downstream failure patterns
-   Stop forwarding requests when unsafe
-   Recover automatically
-   Synchronize state across all Sentinel pods
-   Avoid oscillation
-   Minimize false positives

------------------------------------------------------------------------

## 4. State Machine

Sentinel implements three states:

### CLOSED

-   Normal operation
-   All traffic allowed
-   Failures monitored

### OPEN

-   Requests blocked immediately
-   Fast failure response
-   No downstream forwarding

### HALF_OPEN

-   Limited test requests allowed
-   Evaluate recovery status
-   Transition back to CLOSED or OPEN

------------------------------------------------------------------------

## 5. State Transition Rules

### CLOSED → OPEN

Trigger if:

-   Failure rate \> threshold (e.g., 50%) over rolling window OR
-   Consecutive failures exceed threshold OR
-   Timeout rate spike detected

------------------------------------------------------------------------

### OPEN → HALF_OPEN

After cooldown period expires (e.g., 30 seconds):

-   Allow limited test traffic
-   Monitor success rate

------------------------------------------------------------------------

### HALF_OPEN → CLOSED

If test requests succeed above threshold:

-   Reset failure counters
-   Resume normal operation

------------------------------------------------------------------------

### HALF_OPEN → OPEN

If failures persist:

-   Immediately reopen breaker
-   Restart cooldown

------------------------------------------------------------------------

## 6. Distributed Coordination

### Breaker State Storage

Stored in Redis:

Key: breaker:{service_name}

Value: { state: OPEN \| CLOSED \| HALF_OPEN, last_transition: timestamp
}

------------------------------------------------------------------------

### Pub/Sub Synchronization

When a pod transitions state:

1.  Publish event on Redis channel
2.  All pods receive event
3.  Local breaker state updated instantly

Ensures cluster-wide consistency.

------------------------------------------------------------------------

## 7. Failure Detection Strategy

Metrics tracked per downstream service:

-   Total requests
-   Failed responses (5xx)
-   Timeout count
-   Latency spikes

Sliding window evaluation used for accuracy.

------------------------------------------------------------------------

## 8. Timeout Handling

Proxy enforces strict timeout per request.

On timeout:

-   Increment failure counter
-   Evaluate breaker threshold
-   Possibly trigger OPEN state

Timeouts treated as failures.

------------------------------------------------------------------------

## 9. Preventing Oscillation

To prevent rapid flipping:

-   Cooldown timer enforced
-   Minimum OPEN duration
-   Hysteresis threshold for recovery
-   Gradual HALF_OPEN testing

Example:

Require 80% success rate during HALF_OPEN before closing.

------------------------------------------------------------------------

## 10. Local vs Global Responsibility

Local pod responsibilities:

-   Detect failures quickly
-   Initiate state transition

Global coordination:

-   Redis stores authoritative state
-   Pub/Sub ensures propagation

------------------------------------------------------------------------

## 11. Edge Cases

### Redis Unavailable

-   Local breaker state maintained
-   Conservative behavior applied
-   Avoid reopening prematurely

------------------------------------------------------------------------

### Rapid Pod Scaling

-   New pods fetch breaker state on startup
-   No pod assumes CLOSED by default

------------------------------------------------------------------------

### Network Partition

-   Local state persists temporarily
-   Conservative fallback applied

------------------------------------------------------------------------

## 12. Performance Considerations

-   Breaker checks must be O(1)
-   State cached locally
-   Redis reads minimized
-   Pub/Sub lightweight

------------------------------------------------------------------------

## 13. Trade-Off Analysis

Pros: - Prevents cascading failure - Cluster-wide synchronization - Fast
failure response - Automatic recovery

Cons: - Requires careful threshold tuning - Eventual consistency
window - Redis dependency

------------------------------------------------------------------------

## 14. Validation Criteria

Circuit breaker considered correct if:

-   Downstream crash does not crash Sentinel
-   OPEN state propagates to all pods
-   Recovery detected properly
-   No oscillation under unstable latency
-   Premium tenants still protected during instability

------------------------------------------------------------------------

## 15. Summary

The distributed circuit breaker mechanism provides cluster-wide
resilience by stopping traffic to unstable services and coordinating
recovery across horizontally scaled Sentinel pods.

This ensures infrastructure-level fault tolerance and prevents cascading
system collapse.
