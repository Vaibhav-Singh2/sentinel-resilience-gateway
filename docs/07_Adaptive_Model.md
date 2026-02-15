# Sentinel -- Adaptive Distributed Load Control Microservice

## 07_Adaptive_Model.md

------------------------------------------------------------------------

## 1. Purpose

This document defines the Adaptive Pressure Model used by Sentinel to
dynamically adjust traffic limits based on real-time system conditions.

The adaptive model transforms static rate limiting into intelligent
load-aware traffic shaping.

------------------------------------------------------------------------

## 2. Design Goals

The adaptive model must:

-   Detect system stress early
-   React before collapse occurs
-   Maintain low latency decision-making
-   Coordinate across cluster
-   Avoid oscillation (thrashing)
-   Provide predictable degradation

------------------------------------------------------------------------

## 3. Pressure Signal Inputs

Each Sentinel pod calculates a local pressure score using:

1.  CPU utilization
2.  Memory utilization
3.  Event loop lag
4.  Request queue depth
5.  Error rate
6.  Downstream latency

------------------------------------------------------------------------

## 4. Pressure Score Formula

Each signal normalized between 0 and 1.

Example formula:

pressure = (0.35 × cpu) + (0.25 × memory) + (0.15 × event_loop_lag) +
(0.15 × queue_ratio) + (0.10 × error_rate)

Final result bounded to \[0, 1\].

------------------------------------------------------------------------

## 5. Global Pressure Aggregation

Each pod:

1.  Computes local pressure
2.  Publishes to Redis
3.  Global pressure computed as rolling average
4.  Pods refresh global snapshot every 500ms

Global pressure ensures cluster-wide awareness.

------------------------------------------------------------------------

## 6. Adaptive Rate Adjustment

Effective limit calculation:

effective_limit = base_limit × plan_multiplier × (1 - pressure)

Example:

pressure = 0.7\
limit reduced by 70%

------------------------------------------------------------------------

## 7. Threshold-Based Modes

Pressure \< 0.5 → Normal Mode\
Pressure 0.5--0.75 → Moderate Throttle\
Pressure 0.75--0.9 → Aggressive Throttle\
Pressure \> 0.9 → Critical Protection Mode

------------------------------------------------------------------------

## 8. Protection Mode Behavior

### Moderate Throttle

-   Reduce burst capacity
-   Tighten rate window

### Aggressive Throttle

-   Block FREE tenants
-   Strict sliding window enforcement
-   Disable heavy endpoints

### Critical Mode

-   Allow only PREMIUM
-   Return degraded responses
-   Enable cache-only fallback

------------------------------------------------------------------------

## 9. Oscillation Prevention

To avoid rapid state switching:

-   Use moving average smoothing
-   Apply hysteresis thresholds
-   Minimum mode duration window
-   Gradual limit ramp-up

Example:

Do not exit critical mode until pressure \< 0.7 for 5 seconds.

------------------------------------------------------------------------

## 10. Predictive Spike Detection (Optional)

Detect sudden spike:

If current_RPS \> 1.5 × moving_average_RPS:

Preemptively reduce limits by 20%.

Prevents delayed reaction.

------------------------------------------------------------------------

## 11. Performance Considerations

-   Pressure calculation must be O(1)
-   No heavy computation per request
-   Local caching of metrics
-   Asynchronous update of global state

------------------------------------------------------------------------

## 12. Failure Handling

If Redis unavailable:

-   Fall back to local pressure
-   Apply conservative throttling
-   Avoid unlimited allowance

If metrics unavailable:

-   Default to safe moderate throttling

------------------------------------------------------------------------

## 13. Trade-Off Analysis

Pros: - Real-time adaptive control - Smooth degradation - Tenant-aware
fairness - Proactive failure prevention

Cons: - Slight inconsistency across pods - Requires tuning weights -
Complexity in threshold design

------------------------------------------------------------------------

## 14. Validation Criteria

Adaptive model is successful if:

-   System avoids collapse during 10x spike
-   Throughput degrades smoothly
-   Premium tenants maintain availability
-   No oscillation observed in load tests

------------------------------------------------------------------------

## 15. Summary

The Adaptive Pressure Model converts Sentinel from a static rate limiter
into an intelligent distributed load regulator.

It provides real-time system awareness, coordinated cluster protection,
and predictable degradation behavior under stress.
