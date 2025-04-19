import { IRateLimiter } from '../interfaces/IRateLimiter';
import { LoggingUtils } from '../utils/LoggingUtils';
import { DelayUtils } from '../utils/DelayUtils';

/**
 * Interface for a token bucket
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  rateLimit: number;
}

/**
 * Implementation of the rate limiter using token bucket algorithm
 */
export class TokenBucketRateLimiter implements IRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private defaultRateLimit: number;
  private readonly logger = LoggingUtils.createTaggedLogger('rate-limiter');

  /**
   * Constructor for the token bucket rate limiter
   * @param defaultRateLimit Default rate limit in milliseconds (time between requests)
   */
  constructor(defaultRateLimit: number = 1000) {
    this.defaultRateLimit = defaultRateLimit;
    this.logger.info(`Initialized with default rate limit of ${defaultRateLimit}ms`);
  }

  /**
   * Acquire a token for the specified domain
   * @param domain The domain to acquire a token for
   */
  async acquireToken(domain: string): Promise<void> {
    // Initialize bucket if it doesn't exist
    if (!this.buckets.has(domain)) {
      this.initializeBucket(domain);
    }

    const bucket = this.buckets.get(domain)!;
    const now = Date.now();
    
    // Refill tokens based on time elapsed
    this.refillBucket(bucket, now);
    
    // If no tokens available, wait until one is available
    if (bucket.tokens < 1) {
      const waitTime = bucket.rateLimit - (now - bucket.lastRefill);
      
      if (waitTime > 0) {
        this.logger.debug(`Rate limit hit for ${domain}, waiting ${waitTime}ms`);
        await DelayUtils.delay(waitTime);
      }
      
      // Update the time and refill after waiting
      bucket.lastRefill = Date.now();
      bucket.tokens = 1;
    }
    
    // Consume a token
    bucket.tokens -= 1;
    this.logger.debug(`Token acquired for ${domain}, ${bucket.tokens} tokens remaining`);
  }

  /**
   * Release a token for the specified domain
   * @param domain The domain to release a token for
   */
  releaseToken(domain: string): void {
    if (!this.buckets.has(domain)) {
      return;
    }
    
    const bucket = this.buckets.get(domain)!;
    bucket.tokens += 1;
    
    this.logger.debug(`Token released for ${domain}, ${bucket.tokens} tokens available`);
  }

  /**
   * Set the rate limit for a specific domain
   * @param domain The domain to set the rate limit for
   * @param rateLimit The rate limit in milliseconds
   */
  setRateLimit(domain: string, rateLimit: number): void {
    if (!this.buckets.has(domain)) {
      this.initializeBucket(domain, rateLimit);
      return;
    }
    
    const bucket = this.buckets.get(domain)!;
    
    // Only update if it's different
    if (bucket.rateLimit !== rateLimit) {
      this.logger.info(`Updating rate limit for ${domain} from ${bucket.rateLimit}ms to ${rateLimit}ms`);
      bucket.rateLimit = rateLimit;
    }
  }

  /**
   * Get the current rate limit for a domain
   * @param domain The domain to get the rate limit for
   * @returns The rate limit in milliseconds
   */
  getRateLimit(domain: string): number {
    if (!this.buckets.has(domain)) {
      return this.defaultRateLimit;
    }
    
    return this.buckets.get(domain)!.rateLimit;
  }

  /**
   * Initialize a new token bucket for a domain
   * @param domain The domain to initialize a bucket for
   * @param rateLimit Optional rate limit override
   */
  private initializeBucket(domain: string, rateLimit?: number): void {
    const actualRateLimit = rateLimit || this.defaultRateLimit;
    
    this.buckets.set(domain, {
      tokens: 1, // Start with one token
      lastRefill: Date.now(),
      rateLimit: actualRateLimit
    });
    
    this.logger.debug(`Initialized token bucket for ${domain} with rate limit ${actualRateLimit}ms`);
  }

  /**
   * Refill tokens in a bucket based on time elapsed
   * @param bucket The token bucket to refill
   * @param currentTime Current time in milliseconds
   */
  private refillBucket(bucket: TokenBucket, currentTime: number): void {
    const timeElapsed = currentTime - bucket.lastRefill;
    
    // Calculate how many tokens to add based on time elapsed
    const tokensToAdd = Math.floor(timeElapsed / bucket.rateLimit);
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.tokens + tokensToAdd, 1);
      bucket.lastRefill = currentTime;
    }
  }

  /**
   * Clear all rate limiting information
   */
  reset(): void {
    this.buckets.clear();
    this.logger.info('Rate limiter reset');
  }

  /**
   * Get statistics on the current rate limits
   * @returns Object with rate limiting statistics
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {
      domains: this.buckets.size,
      rateLimits: {}
    };
    
    this.buckets.forEach((bucket, domain) => {
      stats.rateLimits[domain] = {
        rateLimit: bucket.rateLimit,
        availableTokens: bucket.tokens
      };
    });
    
    return stats;
  }
} 