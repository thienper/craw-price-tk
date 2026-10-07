import cron, { ScheduledTask } from 'node-cron';
import { SyncService } from '../services/sync.service.js';
import { env } from '../config/env.js';
import { VIETNAM_TIMEZONE } from '../utils/date.js';
import { logger } from '../utils/logger.js';

export class SyncScheduler {
  private syncService: SyncService;
  private cronJob: ScheduledTask | null = null;

  constructor() {
    this.syncService = new SyncService();
  }

  /**
   * Starts the sync scheduler.
   */
  public async start(): Promise<void> {
    const cronExpr = env.SYNC_CRON;

    logger.info(`[Scheduler] Initializing cron scheduler with pattern: "${cronExpr}" (${VIETNAM_TIMEZONE})...`);

    // 1. Run immediate sync on start if enabled
    if (env.SYNC_ON_START) {
      logger.info('[Scheduler] SYNC_ON_START is true: Running initial synchronization...');
      try {
        await this.syncService.syncAll();
      } catch (err) {
        logger.error(`[Scheduler] Initial sync failed: ${(err as Error).message}`);
      }
    }

    // 2. Schedule recurring cron job
    this.cronJob = cron.schedule(
      cronExpr,
      async () => {
        logger.info('[Scheduler] Cron triggered scheduled sync...');
        try {
          await this.syncService.syncAll();
        } catch (err) {
          logger.error(`[Scheduler] Scheduled sync error: ${(err as Error).message}`);
        }
      },
      {
        timezone: VIETNAM_TIMEZONE,
      },
    );

    logger.info(`[Scheduler] Scheduler running. Next sync will trigger at next scheduled hour.`);
  }

  /**
   * Stops the cron scheduler and shuts down connections gracefully.
   */
  public async stop(): Promise<void> {
    if (this.cronJob) {
      logger.info('[Scheduler] Stopping cron schedule...');
      this.cronJob.stop();
      this.cronJob = null;
    }
    await this.syncService.shutdown();
  }
}
