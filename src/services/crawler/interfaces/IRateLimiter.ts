/**
 * Interface defining the contract for rate limiters
 */
export interface IRateLimiter {
  /**
   * Acquires a token for the specified domain, waiting if necessary
   * @param domain The domain to acquire a token for
   * @returns A promise that resolves when a token is acquired
   */
  acquireToken(domain: string): Promise<void>;

  /**
   * Releases a token back to the specified domain
   * @param domain The domain to release a token for
   */
  releaseToken(domain: string): void;

  /**
   * Sets the rate limit for a specific domain
   * @param domain The domain to set the rate limit for
   * @param rateLimit The rate limit in milliseconds between requests
   */
  setRateLimit(domain: string, rateLimit: number): void;

  /**
   * Gets the current rate limit for a domain
   * @param domain The domain to get the rate limit for
   * @returns The rate limit in milliseconds, or null if not set
   */
  getRateLimit(domain: string): number | null;

  /**
   * Resets all rate limiting information
   */
  reset(): void;

  /**
   * Gets statistics about the current rate limits
   * @returns An object containing statistics about the rate limiter
   */
  getStats(): Record<string, any>;
} 