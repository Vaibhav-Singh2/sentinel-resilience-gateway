import { config } from "../config";
import { getRedisClient } from "../redis/client";
import { logger } from "../logger";
import { pressureMonitor } from "./pressureMonitor";
import Redis from "ioredis";

export class GlobalPressure {
  private redis: Redis;
  private currentGlobalPressure: number = 0;
  private podKey: string;

  constructor() {
    this.redis = getRedisClient();
    this.podKey = `pressure:${config.podId}`;

    // 1. Publish Local Pressure every 1s
    setInterval(() => this.publishLocalPressure(), 1000);

    // 2. Refresh Global Pressure every 500ms
    setInterval(() => this.refreshGlobalPressure(), 500);
  }

  private async publishLocalPressure() {
    try {
      const local = pressureMonitor.getPressure();
      // Set with TTL 5 seconds to auto-expire dead pods
      await this.redis.set(this.podKey, local.toString(), "EX", 5);
    } catch (err) {
      logger.warn({ err }, "Failed to publish local pressure");
    }
  }

  private async refreshGlobalPressure() {
    try {
      // Scan for all pressure keys
      // In production with many pods, better to use a dedicated Set or PubSub
      // For this scale, SCAN or `KEYS pressure:*` is okay if low count.
      // Let's use keys for simplicity as per prompt "average of all pod pressure".
      const keys = await this.redis.keys("pressure:*");
      if (keys.length === 0) {
        this.currentGlobalPressure = pressureMonitor.getPressure(); // Fallback to local
        return;
      }

      const values = await this.redis.mget(keys);
      let sum = 0;
      let count = 0;

      values.forEach((v) => {
        if (v) {
          sum += parseFloat(v);
          count++;
        }
      });

      if (count > 0) {
        this.currentGlobalPressure = sum / count;
      } else {
        this.currentGlobalPressure = pressureMonitor.getPressure();
      }
    } catch (err) {
      // Redis unavailable? Use local pressure as fallback
      logger.warn({ err }, "Failed to refresh global pressure, using local");
      this.currentGlobalPressure = pressureMonitor.getPressure();
    }
  }

  public getGlobalPressure(): number {
    return this.currentGlobalPressure;
  }

  public getLocalPressure(): number {
    return pressureMonitor.getPressure();
  }
}

export const globalPressure = new GlobalPressure();
