import { describe, expect, test, beforeEach, beforeAll } from "bun:test";
import { TokenBucket } from "./tokenBucket";

describe("TokenBucket", () => {
  test("should allow requests up to capacity", () => {
    const bucket = new TokenBucket(5, 1);
    const tenant = "t1";

    expect(bucket.allow(tenant)).toBe(true);
    expect(bucket.allow(tenant)).toBe(true);
    expect(bucket.allow(tenant)).toBe(true);
    expect(bucket.allow(tenant)).toBe(true);
    expect(bucket.allow(tenant)).toBe(true);
    expect(bucket.allow(tenant)).toBe(false); // 6th request rejected
  });

  test("should refill tokens over time", async () => {
    const bucket = new TokenBucket(1, 10); // 10 tokens per second -> 1 token every 100ms
    const tenant = "t2";

    expect(bucket.allow(tenant)).toBe(true);
    expect(bucket.allow(tenant)).toBe(false);

    // Wait for refill (> 100ms)
    await new Promise((r) => setTimeout(r, 150));

    expect(bucket.allow(tenant)).toBe(true);
  });

  test("should maintain separate buckets for tenants", () => {
    const bucket = new TokenBucket(1, 1);
    const t1 = "tenant1";
    const t2 = "tenant2";

    expect(bucket.allow(t1)).toBe(true);
    expect(bucket.allow(t1)).toBe(false);

    // t2 should still be allowed
    expect(bucket.allow(t2)).toBe(true);
  });
});
