import { Injectable, Logger } from '@nestjs/common';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number, delay: number) => void;
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  async execute<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffMultiplier = 2,
      shouldRetry = () => true,
      onRetry,
    } = options;

    let attempt = 0;
    let lastError: Error;

    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        attempt++;

        if (attempt > maxRetries || !shouldRetry(error, attempt)) {
          throw lastError;
        }

        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt - 1),
          maxDelay,
        );

        this.logger.warn(
          `Attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${delay}ms...`,
        );

        if (onRetry) {
          onRetry(error, attempt, delay);
        }

        await this.delay(delay);
      }
    }

    throw lastError!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isRetryableError(error: any): boolean {
    if (!error) return false;
    if (error.code) {
      const retryableCodes = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ESOCKETTIMEDOUT',
        'EAI_AGAIN',
        'ENOTFOUND',
        'EPIPE',
      ];
      if (retryableCodes.includes(error.code)) return true;
    }
    if (error.status) {
      const retryableStatuses = [408, 429, 500, 502, 503, 504];
      if (retryableStatuses.includes(error.status)) return true;
    }
    if (error.message?.includes('timeout')) return true;
    if (error.message?.includes('ECONN')) return true;
    return false;
  }

  withRetry<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options?: RetryOptions,
  ): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      return this.execute(() => fn(...args), options);
    };
  }
}
