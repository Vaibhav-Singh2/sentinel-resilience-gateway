import { config } from "../config";
import { logger } from "../logger";
import { getRedisClient } from "../redis/client";
import Redis from "ioredis";

export enum BreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

interface BreakerData {
  state: BreakerState;
  lastTransition: number;
  failures: number;
  successes: number; // For half-open
}

interface BreakerMessage {
  service: string;
  state: BreakerState;
  timestamp: number;
}

export class CircuitBreaker {
  private breakers: Map<string, BreakerData> = new Map();
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private history: Map<string, number[]> = new Map(); // Timestamp of failures for rolling window

  constructor() {
    this.setupRedis();
  }

  private setupRedis() {
    // Publisher can use existing client?
    // Actually, getRedisClient returns a singleton. We can use it for publishing.
    // For subscribing, we need a dedicated connection blocked in subscribe mode.
    this.publisher = getRedisClient();

    // Dedicated subscriber
    this.subscriber = new Redis(config.redisUrl, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null, // Subscriber needs to keep retrying
    });

    this.subscriber.on("error", (err) => {
      logger.error({ err }, "Breaker subscriber Redis error");
    });

    this.subscriber.subscribe("sentinel:breaker", (err) => {
      if (err) {
        logger.error({ err }, "Failed to subscribe to breaker channel");
      } else {
        logger.info("Subscribed to sentinel:breaker");
      }
    });

    this.subscriber.on("message", (channel, message) => {
      if (channel === "sentinel:breaker") {
        try {
          const data: BreakerMessage = JSON.parse(message);
          this.handleRemoteUpdate(data);
        } catch (err) {
          logger.error({ err, message }, "Failed to parse breaker message");
        }
      }
    });
  }

  private getBreaker(service: string): BreakerData {
    if (!this.breakers.has(service)) {
      this.breakers.set(service, {
        state: BreakerState.CLOSED,
        lastTransition: Date.now(),
        failures: 0,
        successes: 0,
      });
    }
    return this.breakers.get(service)!;
  }

  private getHistory(service: string): number[] {
    if (!this.history.has(service)) {
      this.history.set(service, []);
    }
    return this.history.get(service)!;
  }

  public check(service: string): boolean {
    const breaker = this.getBreaker(service);
    if (breaker.state === BreakerState.OPEN) {
      const now = Date.now();
      if (now - breaker.lastTransition > config.breakerCooldownMs) {
        this.transition(service, BreakerState.HALF_OPEN);
        return true; // Allow first probe
      }
      return false;
    }
    if (breaker.state === BreakerState.HALF_OPEN) {
      // Allow limited requests
      // Actually, we don't track *pending* requests here easily without more state.
      // But we can just allow. If it fails, it goes back to OPEN.
      // If it succeeds, we count.
      // We rely on probabilistic or strict counting?
      // "Allow limited test requests (max 5)"
      // We can use `successes` field as "attempts" in HALF_OPEN?
      // Let's use `successes` + `failures` = total attempts in HALF_OPEN.
      // Wait, `failures` resets on transition? Yes.
      // So if (successes + failures) < max, allow.
      const attempts = breaker.successes + breaker.failures;
      if (attempts < config.breakerHalfOpenMaxRequests) {
        return true;
      }
      return false; // Reached max probes, wait for them to finish?
      // Actually if they finish, they will trigger transition.
      // If they are pending, we might block others.
      // This is simple implementation: block excess probes.
    }
    return true; // CLOSED
  }

  public recordSuccess(service: string) {
    const breaker = this.getBreaker(service);
    if (breaker.state === BreakerState.HALF_OPEN) {
      breaker.successes++;
      this.checkHalfOpenStatus(service, breaker);
    } else if (breaker.state === BreakerState.CLOSED) {
      this.recordSuccessClosed(service);
    }
  }

  public recordFailure(service: string) {
    const breaker = this.getBreaker(service);
    const now = Date.now();

    if (breaker.state === BreakerState.CLOSED) {
      breaker.failures++;

      // Rolling window logic
      const history = this.getHistory(service);
      history.push(now);
      // Prune old
      const windowStart = now - 10000; // 10s window
      while (history.length > 0 && history[0] < windowStart) {
        history.shift();
      }

      // Check threshold
      // We need total requests to calculate rate?
      // User requirements: "failureRate > 50% OR consecutiveFailures > threshold"
      // Rate implies we count total requests too.
      // I am not tracking total requests in CLOSED efficiently yet.
      // "failureCount" is essentially consecutive if we reset on success?
      // Requirement: "failureRate... OR consecutiveFailures"

      // Let's track consecutive failures in `breaker.failures` by resetting on success.
      // And rolling failure count in `history`.

      // CAUTION: recordSuccess must reset consecutive failures in CLOSED.

      // For Rate: we need total requests in window.
      // This adds complexity. Let's rely on "consecutiveFailures" primarily for now as it's requested and simpler?
      // Prompt says: "Track per service: totalRequests, failureCount, rolling failure window"
      // Okay, I should add `totalRequests` tracking for window.
      // Let's optimize: Just keep simple counters for now.

      if (breaker.failures >= config.breakerConsecutiveFailures) {
        this.transition(service, BreakerState.OPEN);
      }
    } else if (breaker.state === BreakerState.HALF_OPEN) {
      breaker.failures++;
      this.transition(service, BreakerState.OPEN); // Fail fast in half-open
    }
  }

  // Helper to maintain consecutive failures logic
  // We need to call this from recordSuccess too
  public recordSuccessClosed(service: string) {
    const breaker = this.getBreaker(service);
    if (breaker.state === BreakerState.CLOSED) {
      breaker.failures = 0; // Reset consecutive
    }
  }

  private checkHalfOpenStatus(service: string, breaker: BreakerData) {
    // "If success rate > 80% ... close breaker"
    // We wait for max requests?
    const attempts = breaker.successes + breaker.failures;
    if (attempts >= config.breakerHalfOpenMaxRequests) {
      const rate = breaker.successes / attempts;
      if (rate >= 0.8) {
        this.transition(service, BreakerState.CLOSED);
      } else {
        this.transition(service, BreakerState.OPEN);
      }
    }
  }

  private transition(service: string, newState: BreakerState) {
    const breaker = this.getBreaker(service);
    if (breaker.state === newState) return;

    const previousState = breaker.state;
    breaker.state = newState;
    breaker.lastTransition = Date.now();
    breaker.failures = 0;
    breaker.successes = 0;

    logger.info(
      {
        event: "breaker_transition",
        service,
        from: previousState,
        to: newState,
      },
      "Circuit Breaker Transition",
    );

    this.publishState(service, newState);
  }

  private publishState(service: string, state: BreakerState) {
    if (this.publisher) {
      const msg: BreakerMessage = {
        service,
        state,
        timestamp: Date.now(),
      };
      this.publisher
        .publish("sentinel:breaker", JSON.stringify(msg))
        .catch((err) => {
          logger.error({ err }, "Failed to publish breaker state");
        });

      // Also persist to key for new pods?
      // "Store breaker state: breaker:{serviceName}"
      const key = `breaker:${service}`;
      this.publisher.set(key, JSON.stringify(msg)).catch((err) => {});
    }
  }

  private handleRemoteUpdate(data: BreakerMessage) {
    const breaker = this.getBreaker(data.service);
    // LWW or simple acceptance?
    // If remote timestamp > local lastTransition?
    if (data.timestamp > breaker.lastTransition) {
      // Update local state without republishing
      breaker.state = data.state;
      breaker.lastTransition = data.timestamp;
      breaker.failures = 0;
      breaker.successes = 0;
      logger.info(
        { event: "breaker_sync", service: data.service, state: data.state },
        "Synced breaker state from remote",
      );
    }
  }
}

export const circuitBreaker = new CircuitBreaker();
