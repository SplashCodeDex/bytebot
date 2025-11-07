import { Injectable } from '@nestjs/common';
import { BytebotLogger } from './logger.service';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  shouldRetry?: (error: any) => boolean;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

@Injectable()
export class RetryService {
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  constructor(private readonly logger: BytebotLogger) {}

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {},
    operationName?: string,
  ): Promise<T> {
    const config = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      ...options,
    };

    const circuitBreakerKey = operationName || 'default';

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(circuitBreakerKey)) {
      throw new Error(
        `Circuit breaker is open for operation: ${circuitBreakerKey}`,
      );
    }

    let lastError: any;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await fn();

        // Reset circuit breaker on success
        this.resetCircuitBreaker(circuitBreakerKey);

        if (attempt > 1) {
          this.logger.info(
            `Operation succeeded on attempt ${attempt}`,
            'RetryService',
          );
        }

        return result;
      } catch (error) {
        lastError = error;

        this.logger.warn(
          `Attempt ${attempt}/${config.maxAttempts} failed: ${error.message}`,
          'RetryService',
        );

        // Update circuit breaker
        this.recordFailure(circuitBreakerKey);

        if (attempt === config.maxAttempts) {
          break;
        }

        // Check if we should retry this error
        if (config.shouldRetry && !config.shouldRetry(error)) {
          this.logger.info(
            'Error not retryable, stopping attempts',
            'RetryService',
          );
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay,
        );

        this.logger.debug(`Waiting ${delay}ms before retry`, 'RetryService');
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isCircuitBreakerOpen(key: string): boolean {
    const breaker = this.circuitBreakers.get(key);

    if (!breaker || breaker.state === 'CLOSED') {
      return false;
    }

    if (breaker.state === 'OPEN') {
      if (Date.now() >= breaker.nextAttemptTime) {
        breaker.state = 'HALF_OPEN';
        this.logger.info(
          `Circuit breaker moving to HALF_OPEN: ${key}`,
          'RetryService',
        );
        return false;
      }
      return true;
    }

    return false; // HALF_OPEN allows one attempt
  }

  private recordFailure(key: string): void {
    const breaker = this.circuitBreakers.get(key) || {
      state: 'CLOSED' as const,
      failures: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };

    breaker.failures++;
    breaker.lastFailureTime = Date.now();

    if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      breaker.state = 'OPEN';
      breaker.nextAttemptTime = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;
      this.logger.warn(`Circuit breaker opened for: ${key}`, 'RetryService');
    }

    this.circuitBreakers.set(key, breaker);
  }

  private resetCircuitBreaker(key: string): void {
    const breaker = this.circuitBreakers.get(key);
    if (breaker && breaker.state !== 'CLOSED') {
      this.circuitBreakers.set(key, {
        state: 'CLOSED',
        failures: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      });
      this.logger.info(`Circuit breaker reset: ${key}`, 'RetryService');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getCircuitBreakerState(key: string): CircuitBreakerState | null {
    return this.circuitBreakers.get(key) || null;
  }

  getAllCircuitBreakerStates(): Record<string, CircuitBreakerState> {
    return Object.fromEntries(this.circuitBreakers);
  }
}
