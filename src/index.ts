import { SyncScheduler } from './scheduler/sync.scheduler.js';
import { logger } from './utils/logger.js';

const scheduler = new SyncScheduler();

async function bootstrap(): Promise<void> {
  logger.info('======================================================');
  logger.info('   TELEGRAM PRODUCT CRAWLER → GOOGLE SHEETS SYNC      ');
  logger.info('======================================================');

  await scheduler.start();
}

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info(`[System] Received ${signal}. Starting graceful shutdown...`);
  try {
    await scheduler.stop();
    logger.info('[System] Shutdown complete. Goodbye!');
    process.exit(0);
  } catch (err) {
    logger.error(`[System] Error during shutdown: ${(err as Error).message}`);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap().catch((err) => {
  logger.error(`[System] Fatal startup failure: ${err.message}`);
  process.exit(1);
});
