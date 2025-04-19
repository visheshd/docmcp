/**
 * Utilities for managing delays and timeouts in the crawler service
 */
export class DelayUtils {
  /**
   * Creates a promise that resolves after the specified delay
   * @param ms The number of milliseconds to delay
   * @returns A promise that resolves after the specified delay
   */
  public static delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  /**
   * Implements exponential backoff strategy for retries
   * @param attempt Current attempt number (0-based)
   * @param baseDelay Base delay in milliseconds
   * @param maxDelay Maximum delay in milliseconds
   * @returns The calculated delay in milliseconds
   */
  static exponentialBackoff(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
    // Calculate exponential delay: baseDelay * 2^attempt
    const delay = baseDelay * Math.pow(2, attempt);
    
    // Add some jitter to avoid thundering herd problem
    const jitter = Math.random() * 0.3 * delay;
    
    // Return the delay capped at maxDelay
    return Math.min(delay + jitter, maxDelay);
  }

  /**
   * Executes a function with retry capability using exponential backoff
   * @param fn The function to execute that returns a promise
   * @param maxRetries Maximum number of retry attempts
   * @param baseDelay Base delay in milliseconds
   * @param maxDelay Maximum delay in milliseconds
   * @returns Promise resolving with the return value of the function or rejecting with the last error
   */
  static async withRetry<T>(
    fn: () => Promise<T>, 
    maxRetries = 3, 
    baseDelay = 1000, 
    maxDelay = 30000
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If this was the last attempt, don't delay, just throw
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // Calculate and apply backoff delay
        const backoffTime = this.exponentialBackoff(attempt, baseDelay, maxDelay);
        await this.delay(backoffTime);
      }
    }
    
    // This should never happen but TypeScript requires a return
    throw lastError || new Error('Retry failed');
  }

  /**
   * Creates a promise that can be used with Promise.race() to implement a timeout
   * @param ms Milliseconds before the timeout
   * @param errorMessage Optional custom error message
   * @returns Promise that rejects after the timeout
   */
  static timeout(ms: number, errorMessage = 'Operation timed out'): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), ms);
    });
  }

  /**
   * Executes a function with a timeout
   * @param fn The function to execute that returns a promise
   * @param timeoutMs Milliseconds before timeout
   * @param errorMessage Optional custom error message
   * @returns Promise resolving with the return value of the function or rejecting with timeout error
   */
  static async withTimeout<T>(
    fn: () => Promise<T>, 
    timeoutMs: number, 
    errorMessage = 'Operation timed out'
  ): Promise<T> {
    return Promise.race([
      fn(),
      this.timeout(timeoutMs, errorMessage)
    ]);
  }
} 