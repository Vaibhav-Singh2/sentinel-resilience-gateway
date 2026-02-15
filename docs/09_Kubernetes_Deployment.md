# Sentinel -- Adaptive Distributed Load Control Microservice

## 09_Kubernetes_Deployment.md

------------------------------------------------------------------------

## 1. Purpose

This document defines the Kubernetes-native deployment architecture for
Sentinel, ensuring horizontal scalability, fault tolerance, and cloud
readiness.

Although deployed locally (kind/minikube), the configuration is designed
to run unchanged on managed cloud Kubernetes platforms (EKS, GKE, AKS).

------------------------------------------------------------------------

## 2. Deployment Overview

Sentinel runs as:

-   Kubernetes Deployment (multiple replicas)
-   ClusterIP Service (internal routing)
-   Horizontal Pod Autoscaler (HPA)
-   Redis Cluster (state coordination)
-   Prometheus (metrics scraping)
-   Grafana (dashboard visualization)

------------------------------------------------------------------------

## 3. Core Kubernetes Components

### 3.1 Deployment

Responsible for:

-   Managing pod replicas
-   Rolling updates
-   Self-healing restarts
-   Version upgrades

Key Properties:

-   Stateless pods
-   Resource requests and limits defined
-   Readiness and liveness probes enabled

------------------------------------------------------------------------

### 3.2 Service (ClusterIP)

Provides:

-   Stable internal DNS
-   Load balancing across pods
-   No sticky sessions
-   Pod-independent routing

Example DNS:

sentinel.default.svc.cluster.local

------------------------------------------------------------------------

### 3.3 Horizontal Pod Autoscaler (HPA)

Sentinel scales based on:

-   CPU utilization
-   Custom Prometheus metrics (optional)

Scaling Model:

minReplicas: 2\
maxReplicas: 10

Trigger Example:

Scale up if CPU \> 65%

------------------------------------------------------------------------

## 4. Resource Configuration

Example Resource Policy:

Requests: - CPU: 200m - Memory: 256Mi

Limits: - CPU: 1000m - Memory: 512Mi

Ensures predictable scheduling and prevents noisy-neighbor issues.

------------------------------------------------------------------------

## 5. Health Probes

### Liveness Probe

Purpose: Restart pod if stuck.

Endpoint: /health/live

------------------------------------------------------------------------

### Readiness Probe

Purpose: Ensure pod only receives traffic when ready.

Endpoint: /health/ready

Checks: - Redis connectivity - Downstream connectivity (optional)

------------------------------------------------------------------------

## 6. Config Management

All configuration via:

-   Environment variables
-   ConfigMaps
-   Kubernetes Secrets

Examples:

-   REDIS_HOST
-   BASE_RATE_LIMIT
-   CIRCUIT_BREAKER_THRESHOLD
-   DOWNSTREAM_URL

No hardcoded values.

------------------------------------------------------------------------

## 7. Redis Deployment Strategy

Options:

1.  Redis Cluster
2.  Redis Sentinel (HA)
3.  Managed Redis (cloud-ready)

For local deployment: - Redis Cluster simulated with multiple containers

Redis must support:

-   Lua scripting
-   Pub/Sub
-   Persistence (optional)

------------------------------------------------------------------------

## 8. Observability Integration

Prometheus:

-   Scrapes /metrics endpoint
-   Stores time-series data

Grafana:

-   Visualizes:
    -   Pressure score
    -   Rejection rate
    -   Breaker state
    -   RPS per tenant
    -   Latency histograms

------------------------------------------------------------------------

## 9. Autoscaling Behavior

Scale-up triggers:

-   Sustained CPU load
-   Increased RPS
-   High pressure score (custom metric)

Scale-down triggers:

-   Low CPU usage
-   Reduced traffic

Pods must:

-   Sync breaker state on startup
-   Fetch global pressure snapshot
-   Join cluster without disruption

------------------------------------------------------------------------

## 10. Rolling Update Strategy

Deployment strategy:

RollingUpdate

Parameters: - maxUnavailable: 1 - maxSurge: 1

Ensures zero downtime during upgrade.

------------------------------------------------------------------------

## 11. Failure Simulation Strategy

Validate:

-   Pod crash → no data loss
-   Scale from 2 → 6 pods under load
-   Downstream crash → breaker sync
-   Redis restart → safe fallback

------------------------------------------------------------------------

## 12. Security Considerations

-   No privileged containers
-   Network policies (optional)
-   TLS termination externalized
-   Secrets encrypted via Kubernetes Secret

------------------------------------------------------------------------

## 13. Cloud Readiness Checklist

-   Stateless pods
-   Externalized configuration
-   Horizontal scalability
-   No local disk dependency
-   Health probes implemented
-   Observability integrated
-   Idempotent startup logic

Sentinel can be deployed to any Kubernetes cluster without code
modification.

------------------------------------------------------------------------

## 14. Validation Criteria

Deployment considered successful if:

-   Pods auto-scale under load
-   No request loss during scaling
-   Breaker state remains synchronized
-   Traffic redistributed automatically
-   Rolling updates cause no downtime

------------------------------------------------------------------------

## 15. Summary

The Kubernetes deployment architecture ensures Sentinel is
production-ready, horizontally scalable, and resilient.

Even when deployed locally, the system mirrors real-world cloud-native
infrastructure design principles.
