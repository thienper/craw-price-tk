import { runInteractiveLogin } from '../telegram/telegram.auth.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  try {
    await runInteractiveLogin();
  } catch (error) {
    logger.error(`[Telegram Login] Fatal error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
