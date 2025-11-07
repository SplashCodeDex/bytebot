import { Injectable, Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBackoff: boolean;
  jitter: boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

@Injectable()
export class EnhancedRetryService {
  private readonly logger = new Logger(EnhancedRetryService.name);
  private circuitBreakers = new Map<
    string,
    {
      state: CircuitBreakerState;
      failureCount: number;
      lastFailureTime: number;
      options: CircuitBreakerOptions;
    }
  >();

  /**
   * Execute a function with retry logic and exponential backoff
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {},
  ): Promise<T> {
    const config: RetryOptions = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      exponentialBackoff: true,
      jitter: true,
      ...options,
    };

    let lastError: Error;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        if (attempt === config.maxAttempts) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, config);

        if (config.onRetry) {
          config.onRetry(attempt, error);
        }

        this.logger.warn(
          `Attempt ${attempt}/${config.maxAttempts} failed: ${error.message}. Retrying in ${delay}ms`,
        );

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Execute a function with circuit breaker pattern
   */
  async withCircuitBreaker<T>(
    fn: () => Promise<T>,
    circuitName: string,
    options: Partial<CircuitBreakerOptions> = {},
  ): Promise<T> {
    const config: CircuitBreakerOptions = {
      failureThreshold: 5,
      timeout: 60000,
      resetTimeout: 300000,
      ...options,
    };

    const circuit = this.getOrCreateCircuit(circuitName, config);

    // Check circuit state
    if (circuit.state === CircuitBreakerState.OPEN) {
      const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
      if (timeSinceLastFailure < config.resetTimeout) {
        throw new Error(
          `Circuit breaker '${circuitName}' is OPEN. Next attempt allowed in ${Math.ceil((config.resetTimeout - timeSinceLastFailure) / 1000)}s`,
        );
      } else {
        // Transition to HALF_OPEN
        circuit.state = CircuitBreakerState.HALF_OPEN;
        this.logger.info(
          `Circuit breaker '${circuitName}' transitioning to HALF_OPEN`,
        );
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        this.createTimeoutPromise(config.timeout, circuitName),
      ]);

      // Success - reset failure count
      if (circuit.state === CircuitBreakerState.HALF_OPEN) {
        circuit.state = CircuitBreakerState.CLOSED;
        this.logger.info(`Circuit breaker '${circuitName}' reset to CLOSED`);
      }
      circuit.failureCount = 0;

      return result;
    } catch (error: any) {
      // Failure - increment count and potentially open circuit
      circuit.failureCount++;
      circuit.lastFailureTime = Date.now();

      if (circuit.failureCount >= config.failureThreshold) {
        circuit.state = CircuitBreakerState.OPEN;
        this.logger.warn(
          `Circuit breaker '${circuitName}' opened due to ${circuit.failureCount} failures`,
        );
      }

      throw error;
    }
  }

  /**
   * Combine retry with circuit breaker
   */
  async withRetryAndCircuitBreaker<T>(
    fn: () => Promise<T>,
    circuitName: string,
    retryOptions: Partial<RetryOptions> = {},
    circuitOptions: Partial<CircuitBreakerOptions> = {},
  ): Promise<T> {
    return this.withCircuitBreaker(
      () => this.withRetry(fn, retryOptions),
      circuitName,
      circuitOptions,
    );
  }

  private calculateDelay(attempt: number, options: RetryOptions): number {
    let delay = options.baseDelay;

    if (options.exponentialBackoff) {
      delay = Math.min(
        options.baseDelay * Math.pow(2, attempt - 1),
        options.maxDelay,
      );
    }

    if (options.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5); // Add ±50% jitter
    }

    return Math.floor(delay);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getOrCreateCircuit(name: string, options: CircuitBreakerOptions) {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        options,
      });
    }
    return this.circuitBreakers.get(name)!;
  }

  private createTimeoutPromise(
    timeout: number,
    circuitName: string,
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Circuit breaker '${circuitName}' timeout after ${timeout}ms`,
          ),
        );
      }, timeout);
    });
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitStatus(circuitName: string) {
    const circuit = this.circuitBreakers.get(circuitName);
    if (!circuit) return null;

    return {
      name: circuitName,
      state: circuit.state,
      failureCount: circuit.failureCount,
      lastFailureTime: circuit.lastFailureTime,
      options: circuit.options,
    };
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllCircuitStatuses() {
    return Array.from(this.circuitBreakers.keys()).map((name) =>
      this.getCircuitStatus(name),
    );
  }

  /**
   * Reset a circuit breaker manually
   */
  resetCircuit(circuitName: string): boolean {
    const circuit = this.circuitBreakers.get(circuitName);
    if (!circuit) return false;

    circuit.state = CircuitBreakerState.CLOSED;
    circuit.failureCount = 0;
    circuit.lastFailureTime = 0;

    this.logger.info(`Circuit breaker '${circuitName}' manually reset`);
    return true;
  }
}
