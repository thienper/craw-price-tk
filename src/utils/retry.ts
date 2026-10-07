import { logger } from './logger.js';
import { sleep, handleFloodWaitIfAny } from './delay.js';

export interface RetryOptions {
  maxRetries?: number;
  delaysMs?: number[];
  label?: string;
  onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_DELAYS_MS = [1000, 2000, 4000];

/**
 * Execute an async operation with exponential backoff retry.
 * Handles Telegram FLOOD_WAIT specifically by sleeping the requested duration.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const label = options.label ?? 'Operation';

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;

      if (options.onRetry) {
        options.onRetry(error, attempt);
      }

      if (attempt >= maxRetries) {
        logger.error(`[Retry] ${label} failed after ${maxRetries} attempts.`);
        break;
      }

      // Check if this was a Telegram FLOOD_WAIT
      const wasFloodWait = await handleFloodWaitIfAny(error);
      if (wasFloodWait) {
        logger.info(`[Retry] Resuming ${label} after FLOOD_WAIT (Attempt ${attempt + 1}/${maxRetries})`);
        continue;
      }

      const backoffDelay = delays[attempt - 1] ?? delays[delays.length - 1] ?? 1000;
      logger.warn(
        `[Retry] ${label} attempt ${attempt} failed: ${(error as Error)?.message || error}. Retrying in ${backoffDelay}ms...`,
      );
      await sleep(backoffDelay);
    }
  }

  throw lastError;
}
