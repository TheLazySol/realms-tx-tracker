/**
 * Token Bucket Rate Limiter for RPC calls
 * 
 * Implements a token bucket algorithm to throttle requests
 * to stay within the configured requests-per-second limit.
 */

/**
 * Rate limiter instance
 */
class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per millisecond
  private lastRefill: number;
  private initialized: boolean = false;

  constructor() {
    this.tokens = 0;
    this.maxTokens = 0;
    this.refillRate = 0;
    this.lastRefill = Date.now();
  }

  /**
   * Initialize the rate limiter with the given RPS limit
   * @param rps - Requests per second limit
   */
  init(rps: number): void {
    this.maxTokens = rps;
    this.tokens = rps; // Start with full bucket
    this.refillRate = rps / 1000; // Convert to tokens per millisecond
    this.lastRefill = Date.now();
    this.initialized = true;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Calculate wait time needed before a request can proceed
   * @returns Wait time in milliseconds (0 if no wait needed)
   */
  private getWaitTime(): number {
    this.refill();
    
    if (this.tokens >= 1) {
      return 0;
    }
    
    // Calculate time needed to get 1 token
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  /**
   * Acquire a token, waiting if necessary
   * Call this before making an RPC request
   */
  async throttle(): Promise<void> {
    if (!this.initialized) {
      // If not initialized, don't throttle (allows usage before config load)
      return;
    }

    const waitTime = this.getWaitTime();
    
    if (waitTime > 0) {
      await this.sleep(waitTime);
      this.refill();
    }
    
    // Consume a token
    this.tokens -= 1;
  }

  /**
   * Sleep for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if the rate limiter has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current token count (for debugging/logging)
   */
  getTokenCount(): number {
    this.refill();
    return this.tokens;
  }
}

// Global singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Initialize the global rate limiter
 * @param rps - Requests per second limit
 */
export function initRateLimiter(rps: number): void {
  rateLimiter.init(rps);
}

/**
 * Throttle before making an RPC request
 * Waits if necessary to stay within rate limits
 */
export async function throttle(): Promise<void> {
  await rateLimiter.throttle();
}

