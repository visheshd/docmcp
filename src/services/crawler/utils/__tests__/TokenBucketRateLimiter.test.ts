import { TokenBucketRateLimiter } from '../TokenBucketRateLimiter';

describe('TokenBucketRateLimiter', () => {
  let rateLimiter: TokenBucketRateLimiter;

  beforeEach(() => {
    rateLimiter = new TokenBucketRateLimiter(100, 1);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with default values', () => {
    expect(rateLimiter).toBeDefined();
  });

  it('should immediately acquire a token when available', async () => {
    const startTime = Date.now();
    await rateLimiter.acquireToken('example.com');
    const endTime = Date.now();
    
    // Should be almost immediate (allowing for a small margin)
    expect(endTime - startTime).toBeLessThan(50);
  });

  it('should wait for the rate limit before acquiring another token', async () => {
    jest.useFakeTimers();
    
    const domain = 'example.com';
    
    // First token should be immediate
    await rateLimiter.acquireToken(domain);
    
    // Second token should require waiting
    const tokenPromise = rateLimiter.acquireToken(domain);
    
    // Fast-forward time to just before the rate limit
    jest.advanceTimersByTime(90);
    await Promise.resolve(); // Let any pending promises resolve
    
    // Token should not have been acquired yet
    expect(tokenPromise).not.toHaveProperty('_value');
    
    // Fast-forward past the rate limit
    jest.advanceTimersByTime(20);
    await Promise.resolve(); // Let pending promises resolve
    
    // Now the promise should resolve
    await tokenPromise;
  });

  it('should allow setting custom rate limits per domain', async () => {
    jest.useFakeTimers();
    
    // Set different rate limits for different domains
    rateLimiter.setRateLimit('fast.com', 50);
    rateLimiter.setRateLimit('slow.com', 200);
    
    // Acquire initial tokens
    await rateLimiter.acquireToken('fast.com');
    await rateLimiter.acquireToken('slow.com');
    
    // Start acquiring second tokens
    const fastPromise = rateLimiter.acquireToken('fast.com');
    const slowPromise = rateLimiter.acquireToken('slow.com');
    
    // After 60ms, fast.com should be ready but slow.com should still be waiting
    jest.advanceTimersByTime(60);
    await Promise.resolve();
    
    // Fast domain should be resolved
    await fastPromise;
    
    // Slow domain should still be pending
    expect(slowPromise).not.toHaveProperty('_value');
    
    // After 150 more ms, slow domain should resolve too
    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await slowPromise;
  });

  it('should release tokens and process waiting requests', async () => {
    const domain = 'example.com';
    
    // Acquire the only available token
    await rateLimiter.acquireToken(domain);
    
    // Start a second acquisition that should wait
    const tokenPromise = rateLimiter.acquireToken(domain);
    
    // Release the token
    rateLimiter.releaseToken(domain);
    
    // Now the waiting request should resolve without waiting for the full time
    await tokenPromise;
  });

  it('should return rate limit statistics', async () => {
    // Set up some domains
    rateLimiter.setRateLimit('domain1.com', 100);
    rateLimiter.setRateLimit('domain2.com', 200);
    
    // Acquire some tokens
    await rateLimiter.acquireToken('domain1.com');
    
    // Get stats
    const stats = rateLimiter.getStats();
    
    expect(stats.totalDomains).toBe(2);
    expect(stats.domains['domain1.com']).toBeDefined();
    expect(stats.domains['domain2.com']).toBeDefined();
    expect(stats.domains['domain1.com'].rateLimit).toBe(100);
    expect(stats.domains['domain2.com'].rateLimit).toBe(200);
    expect(stats.domains['domain1.com'].availableTokens).toBe(0); // Used the token
    expect(stats.domains['domain2.com'].availableTokens).toBe(1); // Still has the token
  });

  it('should reset all rate limiting data', async () => {
    // Set up some domains
    await rateLimiter.acquireToken('domain1.com');
    await rateLimiter.acquireToken('domain2.com');
    
    // Reset
    rateLimiter.reset();
    
    // Stats should be empty
    const stats = rateLimiter.getStats();
    expect(stats.totalDomains).toBe(0);
    expect(Object.keys(stats.domains)).toHaveLength(0);
    
    // Should be able to immediately acquire tokens again
    await rateLimiter.acquireToken('domain1.com');
    await rateLimiter.acquireToken('domain2.com');
  });
}); 