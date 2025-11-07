import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { BytebotLogger } from './logger.service';

export interface ShutdownHandler {
  name: string;
  priority: number; // Lower numbers execute first
  handler: () => Promise<void>;
  timeout?: number; // Optional timeout in ms
}

@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;

  constructor(private readonly logger: BytebotLogger) {
    // Handle process signals
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      this.logger.error(
        'Uncaught exception, shutting down gracefully',
        error.stack,
        'GracefulShutdown',
      );
      this.handleShutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      this.logger.error(
        'Unhandled rejection, shutting down gracefully',
        String(reason),
        'GracefulShutdown',
      );
      this.handleShutdown('unhandledRejection');
    });
  }

  registerShutdownHandler(handler: ShutdownHandler): void {
    this.handlers.push(handler);
    // Sort by priority (lower numbers first)
    this.handlers.sort((a, b) => a.priority - b.priority);

    this.logger.debug(
      `Registered shutdown handler: ${handler.name} (priority: ${handler.priority})`,
      'GracefulShutdown',
    );
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (signal) {
      await this.handleShutdown(signal);
    }
  }

  private async handleShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn(
        'Shutdown already in progress, ignoring signal',
        'GracefulShutdown',
      );
      return this.shutdownPromise || Promise.resolve();
    }

    this.isShuttingDown = true;
    this.logger.info(`Received shutdown signal: ${signal}`, 'GracefulShutdown');

    this.shutdownPromise = this.executeShutdown();
    await this.shutdownPromise;
  }

  private async executeShutdown(): Promise<void> {
    const startTime = Date.now();
    let completedHandlers = 0;

    try {
      for (const handler of this.handlers) {
        const handlerStartTime = Date.now();

        try {
          this.logger.info(
            `Executing shutdown handler: ${handler.name}`,
            'GracefulShutdown',
          );

          // Execute with timeout if specified
          if (handler.timeout) {
            await Promise.race([
              handler.handler(),
              this.createTimeoutPromise(handler.timeout, handler.name),
            ]);
          } else {
            await handler.handler();
          }

          const duration = Date.now() - handlerStartTime;
          this.logger.info(
            `Shutdown handler completed: ${handler.name} (${duration}ms)`,
            'GracefulShutdown',
          );
          completedHandlers++;
        } catch (error) {
          this.logger.error(
            `Shutdown handler failed: ${handler.name} - ${error.message}`,
            error.stack,
            'GracefulShutdown',
          );
          // Continue with other handlers even if one fails
        }
      }

      const totalDuration = Date.now() - startTime;
      this.logger.info(
        `Graceful shutdown completed: ${completedHandlers}/${this.handlers.length} handlers (${totalDuration}ms)`,
        'GracefulShutdown',
      );
    } catch (error) {
      this.logger.error(
        'Error during graceful shutdown',
        error.stack,
        'GracefulShutdown',
      );
    } finally {
      // Force exit after a reasonable timeout
      setTimeout(() => {
        this.logger.warn(
          'Force exiting after shutdown timeout',
          'GracefulShutdown',
        );
        process.exit(1);
      }, 30000); // 30 second max shutdown time

      process.exit(0);
    }
  }

  private createTimeoutPromise(
    timeout: number,
    handlerName: string,
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Shutdown handler timeout: ${handlerName} (${timeout}ms)`),
        );
      }, timeout);
    });
  }

  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}
