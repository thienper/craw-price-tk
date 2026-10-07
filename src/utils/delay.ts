import { logger } from './logger.js';

/**
 * Pause execution for given milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pause execution for a random duration between minMs and maxMs.
 */
export async function randomDelay(minMs: number = 1200, maxMs: number = 2500): Promise<void> {
  const delayTime = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(delayTime);
}

/**
 * Check if an error is a Telegram FLOOD_WAIT error and extract required wait seconds.
 */
export function extractFloodWaitSeconds(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  // GramJS specific error properties
  const err = error as { errorMessage?: string; message?: string; seconds?: number };

  if (typeof err.seconds === 'number' && err.seconds > 0) {
    return err.seconds;
  }

  const msg = err.errorMessage || err.message || '';
  const match = msg.match(/FLOOD_WAIT_(\d+)/i) || msg.match(/wait of (\d+) seconds/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Handle Telegram FLOOD_WAIT if present by waiting the requested time + buffer.
 * Returns true if flood wait was detected and handled, false otherwise.
 */
export async function handleFloodWaitIfAny(error: unknown): Promise<boolean> {
  const waitSeconds = extractFloodWaitSeconds(error);
  if (waitSeconds !== null && waitSeconds > 0) {
    const totalWait = waitSeconds + 1; // 1s buffer
    logger.warn(`[Telegram] FLOOD_WAIT detected: waiting ${totalWait}s as requested by Telegram...`);
    await sleep(totalWait * 1000);
    return true;
  }
  return false;
}
