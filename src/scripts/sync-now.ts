import { SyncService } from '../services/sync.service.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  const syncService = new SyncService();

  try {
    logger.info('[Manual Sync] Triggering manual sync now...');
    const result = await syncService.syncAll({ resetSheet: true });
    logger.info(`[Manual Sync] Completed with status: ${result.status}`);
  } catch (error) {
    logger.error(`[Manual Sync] Failed: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await syncService.shutdown();
  }
}

main();
