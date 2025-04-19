import { IRateLimiter } from '../interfaces/IRateLimiter';
import { DelayUtils } from './DelayUtils';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  rateLimit: number;
  maxTokens: number;
}

/**
 * Implementation of a token bucket rate limiter
 * Uses the token bucket algorithm to control request rates per domain
 */
export class TokenBucketRateLimiter implements IRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private waitingQueue: Map<string, Array<() => void>> = new Map();
  private defaultRateLimit: number;
  private defaultMaxTokens: number;

  /**
   * Creates a new TokenBucketRateLimiter
   * @param defaultRateLimit Default rate limit in milliseconds between requests
   * @param defaultMaxTokens Default maximum number of tokens per bucket
   */
  constructor(defaultRateLimit: number = 1000, defaultMaxTokens: number = 1) {
    this.defaultRateLimit = defaultRateLimit;
    this.defaultMaxTokens = defaultMaxTokens;
  }

  /**
   * Acquires a token for the specified domain, waiting if necessary
   * @param domain The domain to acquire a token for
   * @returns A promise that resolves when a token is acquired
   */
  public async acquireToken(domain: string): Promise<void> {
    if (!this.buckets.has(domain)) {
      this.initializeBucket(domain);
    }

    const bucket = this.buckets.get(domain)!;
    this.refillBucket(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return Promise.resolve();
    }

    // No tokens available, must wait
    return new Promise<void>((resolve) => {
      if (!this.waitingQueue.has(domain)) {
        this.waitingQueue.set(domain, []);
      }
      
      this.waitingQueue.get(domain)!.push(resolve);
      
      // Schedule checking for tokens after delay
      const timeToNextToken = bucket.rateLimit - (Date.now() - bucket.lastRefill);
      
      setTimeout(() => {
        this.checkWaitingQueue(domain);
      }, Math.max(10, timeToNextToken));
    });
  }

  /**
   * Releases a token back to the specified domain
   * @param domain The domain to release a token for
   */
  public releaseToken(domain: string): void {
    if (!this.buckets.has(domain)) {
      return;
    }

    const bucket = this.buckets.get(domain)!;
    if (bucket.tokens < bucket.maxTokens) {
      bucket.tokens += 1;
      this.checkWaitingQueue(domain);
    }
  }

  /**
   * Sets the rate limit for a specific domain
   * @param domain The domain to set the rate limit for
   * @param rateLimit The rate limit in milliseconds between requests
   */
  public setRateLimit(domain: string, rateLimit: number): void {
    if (!this.buckets.has(domain)) {
      this.initializeBucket(domain, rateLimit);
      return;
    }

    const bucket = this.buckets.get(domain)!;
    bucket.rateLimit = rateLimit;
  }

  /**
   * Gets the current rate limit for a domain
   * @param domain The domain to get the rate limit for
   * @returns The rate limit in milliseconds, or null if not set
   */
  public getRateLimit(domain: string): number | null {
    if (!this.buckets.has(domain)) {
      return null;
    }
    return this.buckets.get(domain)!.rateLimit;
  }

  /**
   * Resets all rate limiting information
   */
  public reset(): void {
    this.buckets.clear();
    this.waitingQueue.clear();
  }

  /**
   * Gets statistics about the current rate limits
   * @returns An object containing statistics about the rate limiter
   */
  public getStats(): Record<string, any> {
    const stats: Record<string, any> = {
      domains: {},
      totalDomains: this.buckets.size,
      totalWaiting: 0
    };

    for (const [domain, bucket] of this.buckets.entries()) {
      const waitingCount = this.waitingQueue.has(domain) ? this.waitingQueue.get(domain)!.length : 0;
      stats.totalWaiting += waitingCount;
      
      stats.domains[domain] = {
        rateLimit: bucket.rateLimit,
        availableTokens: bucket.tokens,
        maxTokens: bucket.maxTokens,
        waiting: waitingCount
      };
    }

    return stats;
  }

  /**
   * Initializes a bucket for a domain
   * @param domain The domain to initialize
   * @param rateLimit Optional custom rate limit
   */
  private initializeBucket(domain: string, rateLimit?: number): void {
    this.buckets.set(domain, {
      tokens: this.defaultMaxTokens,
      lastRefill: Date.now(),
      rateLimit: rateLimit || this.defaultRateLimit,
      maxTokens: this.defaultMaxTokens
    });
  }

  /**
   * Refills tokens in a bucket based on elapsed time
   * @param bucket The bucket to refill
   */
  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    
    if (elapsed >= bucket.rateLimit) {
      const tokensToAdd = Math.floor(elapsed / bucket.rateLimit);
      
      if (tokensToAdd > 0) {
        bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now - (elapsed % bucket.rateLimit);
      }
    }
  }

  /**
   * Checks if there are waiting requests in the queue that can now be processed
   * @param domain The domain to check
   */
  private checkWaitingQueue(domain: string): void {
    if (!this.waitingQueue.has(domain) || this.waitingQueue.get(domain)!.length === 0) {
      return;
    }

    const bucket = this.buckets.get(domain)!;
    this.refillBucket(bucket);

    while (bucket.tokens >= 1 && this.waitingQueue.get(domain)!.length > 0) {
      const resolve = this.waitingQueue.get(domain)!.shift()!;
      bucket.tokens -= 1;
      resolve();
    }

    // If we still have waiting requests but no tokens, schedule another check
    if (this.waitingQueue.get(domain)!.length > 0) {
      const timeToNextToken = bucket.rateLimit - (Date.now() - bucket.lastRefill);
      
      setTimeout(() => {
        this.checkWaitingQueue(domain);
      }, Math.max(10, timeToNextToken));
    }
  }
} 