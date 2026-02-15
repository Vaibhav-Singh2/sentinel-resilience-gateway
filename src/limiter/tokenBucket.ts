export interface BucketState {
  tokens: number;
  lastRefill: number; // timestamp in ms
}

export class TokenBucket {
  private buckets: Map<string, BucketState>;
  private capacity: number;
  private refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.buckets = new Map();
    this.capacity = capacity;
    this.refillRate = refillRate;
  }

  allow(tenantId: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(tenantId);

    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefill: now,
      };
      this.buckets.set(tenantId, bucket);
    }

    // Calculate refill
    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = (elapsedMs / 1000) * this.refillRate;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  // Helper for metrics/debugging if needed
  getRemainingTokens(tenantId: string): number {
    const bucket = this.buckets.get(tenantId);
    return bucket ? bucket.tokens : this.capacity;
  }
}
