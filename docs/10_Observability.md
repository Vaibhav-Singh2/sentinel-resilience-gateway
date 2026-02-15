# Sentinel -- Adaptive Distributed Load Control Microservice

## 10_Observability.md

------------------------------------------------------------------------

## 1. Purpose

This document defines the observability and monitoring strategy for
Sentinel.

Sentinel is infrastructure software. Without strong observability, its
adaptive behavior cannot be validated or trusted.

This document covers:

-   Metrics design
-   Logging strategy
-   Distributed tracing (optional)
-   Dashboard architecture
-   Alerting rules

------------------------------------------------------------------------

## 2. Observability Goals

Sentinel must provide:

-   Real-time traffic visibility
-   Pressure score transparency
-   Circuit breaker visibility
-   Tenant-level throttling insights
-   Autoscaling observability
-   Failure detection indicators

------------------------------------------------------------------------

## 3. Metrics Architecture

Sentinel exposes a Prometheus-compatible `/metrics` endpoint.

Metrics are grouped into:

1.  Traffic Metrics
2.  Rate Limiting Metrics
3.  Pressure Metrics
4.  Circuit Breaker Metrics
5.  System Metrics

------------------------------------------------------------------------

## 4. Traffic Metrics

request_total{tenant, status} request_allowed_total
request_rejected_total request_degraded_total

Latency metrics:

request_duration_seconds (Histogram) p50 / p90 / p99 latency

------------------------------------------------------------------------

## 5. Rate Limiting Metrics

rate_limit_exceeded_total{tenant} burst_allowance_used_total
redis_rate_limit_checks_total

Used to validate fairness and enforcement accuracy.

------------------------------------------------------------------------

## 6. Pressure Metrics

pressure_score (Gauge) cpu_usage memory_usage event_loop_lag_ms
queue_depth_ratio error_rate

These metrics validate adaptive model behavior.

------------------------------------------------------------------------

## 7. Circuit Breaker Metrics

breaker_state{service} breaker_open_total breaker_half_open_total
downstream_failure_rate

Used to verify cascading failure prevention.

------------------------------------------------------------------------

## 8. Redis Coordination Metrics

redis_latency_ms redis_error_total redis_pubsub_events_total

Ensures Redis does not become bottleneck.

------------------------------------------------------------------------

## 9. Kubernetes & Scaling Metrics

pod_count cpu_utilization memory_utilization hpa_scale_events_total

These validate autoscaling behavior.

------------------------------------------------------------------------

## 10. Logging Strategy

Structured JSON logging using Pino.

Log Categories:

-   Request logs
-   Decision logs
-   Breaker transitions
-   Redis errors
-   Scaling events

Log Level Guidelines:

INFO → normal decisions\
WARN → throttling events\
ERROR → Redis or downstream failures

------------------------------------------------------------------------

## 11. Dashboard Design (Grafana)

Dashboard Panels:

1.  Cluster RPS Over Time
2.  Pressure Score Trend
3.  Rejection Rate by Tenant
4.  Circuit Breaker State Timeline
5.  Redis Latency Heatmap
6.  Pod Count vs RPS
7.  Latency Distribution

Dashboard must allow correlation analysis between load and adaptive
behavior.

------------------------------------------------------------------------

## 12. Alerting Strategy

Example Alerts:

-   Pressure Score \> 0.85 for 30s
-   Breaker OPEN state persists \> 60s
-   Redis latency \> 50ms sustained
-   Rejection rate \> 40%
-   Pod CPU \> 80%

Alerts ensure operational safety.

------------------------------------------------------------------------

## 13. Validation Scenarios

Observability considered successful if:

-   Traffic spike clearly visible
-   Pressure increases smoothly
-   Rejection rate correlates with pressure
-   Breaker transitions visible on dashboard
-   HPA scaling events visible
-   Redis latency traceable

------------------------------------------------------------------------

## 14. Future Extensions

-   Distributed tracing (OpenTelemetry)
-   Correlation IDs per request
-   Per-tenant analytics dashboards
-   Long-term anomaly detection

------------------------------------------------------------------------

## 15. Summary

Observability transforms Sentinel from an algorithmic system into an
operable production-grade platform.

Metrics, dashboards, and alerts ensure transparency, debuggability, and
validation of adaptive distributed behavior.
