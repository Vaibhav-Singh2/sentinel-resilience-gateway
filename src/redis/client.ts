import Redis from "ioredis";
import { config } from "../config";
import { logger } from "../logger";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(config.redisUrl, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 1, // Fail fast if Redis is down
  });

  redisClient.on("connect", () => {
    logger.info("Connected to Redis");
  });

  redisClient.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });

  return redisClient;
}
