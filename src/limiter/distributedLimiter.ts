import { config } from "../config";
import { getRedisClient } from "../redis/client";
import { logger } from "../logger";

// Lua script for atomic sliding window
// 1. Remove elements older than window
// 2. Add current element
// 3. Count elements
// 4. Set expire
const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local windowMs = tonumber(ARGV[1])
  local now = tonumber(ARGV[2])
  local requestId = ARGV[3]
  local limit = tonumber(ARGV[4])
  local ttlSeconds = math.ceil(windowMs / 1000) + 5

  -- Remove expired entries
  redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)

  -- Add current request
  redis.call('ZADD', key, now, requestId)

  -- Count requests
  local count = redis.call('ZCARD', key)

  -- Set expiry
  redis.call('EXPIRE', key, ttlSeconds)

  -- Check limit
  if count > limit then
    return 0 -- Allowed? No. (Reason: count > limit, so return 0 to indicate rejection)
  else
    return 1 -- Allowed? Yes.
  end
`;

export class DistributedLimiter {
  constructor() {
    // Determine if we need to preload script.
    // ioredis handles script caching automatically if we define command,
    // or we can just call eval. defineCommand is better.
    const redis = getRedisClient();
    redis.defineCommand("checkSlidingWindow", {
      numberOfKeys: 1,
      lua: SLIDING_WINDOW_SCRIPT,
    });
  }

  async checkDistributedLimit(
    tenantId: string,
    requestId: string,
    uniqueLimit?: number,
  ): Promise<boolean> {
    const redis = getRedisClient();
    const key = `rate:${tenantId}`;
    const now = Date.now();
    const limit = uniqueLimit || config.baseRateLimit;

    try {
      // @ts-ignore - checkSlidingWindow added via defineCommand
      const result = await redis.checkSlidingWindow(
        key,
        config.windowMs,
        now,
        requestId,
        limit,
      );

      return result === 1;
    } catch (err) {
      logger.error({ err, tenantId }, "Redis rate limiter error");
      // Conservative mode: Reject or Accept?
      // Requirement says: "fallback to conservative mode: reject request OR reduce local capacity"
      // Let's reject for safety as requested "Do NOT allow unlimited traffic if Redis is down."
      return false;
    }
  }

  public getAdaptiveLimit(
    globalPressure: number,
    planMultiplier: number = 1,
  ): number {
    // effectiveLimit = BASE_RATE_LIMIT * planMultiplier * (1 - globalPressure)
    const limit = Math.floor(
      config.baseRateLimit * planMultiplier * (1 - globalPressure),
    );
    return Math.max(1, limit); // Ensure at least 1 request allowed unless blocked by protection mode
  }
}

export const distributedLimiter = new DistributedLimiter();
