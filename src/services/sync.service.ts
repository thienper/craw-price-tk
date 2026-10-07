import { TelegramService } from '../telegram/telegram.service.js';
import { GoogleSheetsService, SheetsSyncResult } from '../google/google-sheets.service.js';
import { ProductNormalizer } from '../products/product-normalizer.service.js';
import { formatVietnamTime } from '../utils/date.js';
import { logger } from '../utils/logger.js';

let isSyncRunning = false;

export class SyncService {
  private telegramService: TelegramService;
  private sheetsService: GoogleSheetsService;

  constructor() {
    this.telegramService = new TelegramService();
    this.sheetsService = new GoogleSheetsService();
  }

  /**
   * Executes a full synchronization cycle:
   * 1. Check & acquire execution lock.
   * 2. Initialize Google Sheets cache.
   * 3. Crawl Telegram bot categories & stream directly to Google Sheets in real-time.
   * 4. Finalize inactive products and record run metadata into SyncLogs.
   */
  public async syncAll(options?: { resetSheet?: boolean }): Promise<{
    syncId: string;
    status: 'SUCCESS' | 'SUCCESS_WITH_ERRORS' | 'FAILED' | 'SKIPPED';
    result?: SheetsSyncResult;
  }> {
    if (isSyncRunning) {
      logger.warn('[Sync] Sync skipped because previous sync is still running.');
      return { syncId: '', status: 'SKIPPED' };
    }

    isSyncRunning = true;
    const startTime = new Date();
    const syncId = `sync_${Date.now()}`;
    const startedAt = formatVietnamTime(startTime);

    logger.info(`\n======================================================`);
    logger.info(`[Sync] Starting synchronization cycle [${syncId}] at ${startedAt}...`);
    logger.info(`======================================================`);

    let categoriesCount = 0;
    let totalFound = 0;
    let errorsCount = 0;
    const syncResult: SheetsSyncResult = {
      added: 0,
      updated: 0,
      unchanged: 0,
      deactivated: 0,
      priceChanges: 0,
    };
    let status: 'SUCCESS' | 'SUCCESS_WITH_ERRORS' | 'FAILED' = 'SUCCESS';
    const seenProductIds = new Set<string>();

    try {
      // 1. Load existing cache into memory for price history comparison
      await this.sheetsService.loadExistingCache();

      // 2. Boldly wipe the sheet clean on every sync as requested by user
      const shouldReset = options?.resetSheet !== false;
      if (shouldReset) {
        logger.info('[Sync] Clean-wiping Products sheet (values + formatting) for a fresh top-to-bottom sync...');
        await this.sheetsService.resetProductsSheet();
      }

      // 2. Crawl Telegram Bot with real-time streaming directly to Google Sheets!
      const { products, stats } = await this.telegramService.crawlProducts(
        async (categoryProducts, catName) => {
          // Normalize and validate products of this category
          const validProducts = ProductNormalizer.validateAndNormalize(categoryProducts);

          for (const p of validProducts) {
            seenProductIds.add(p.id);
          }

          // Write immediately to Google Sheets!
          const catResult = await this.sheetsService.syncCategoryProducts(validProducts);

          syncResult.added += catResult.added;
          syncResult.updated += catResult.updated;
          syncResult.unchanged += catResult.unchanged;
          syncResult.priceChanges += catResult.priceChanges;

          logger.info(
            `[GoogleSheets] >> Category [${catName}]: +${catResult.added} new, ~${catResult.updated} updated, =${catResult.unchanged} unchanged written to Google Sheets!`,
          );
        },
      );

      categoriesCount = stats.categoriesCrawled;
      totalFound = products.length;
      errorsCount = stats.errorsCount;

      if (errorsCount > 0) {
        status = 'SUCCESS_WITH_ERRORS';
      }

      // 3. Finalize: Mark missing products as inactive (Active = FALSE)
      const deactivatedCount = await this.sheetsService.finalizeSync(seenProductIds);
      syncResult.deactivated = deactivatedCount;

      const endTime = new Date();
      const finishedAt = formatVietnamTime(endTime);
      const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      logger.info(`\n======================================================`);
      logger.info(`[Sync] Finished cycle [${syncId}] in ${durationSeconds}s`);
      logger.info(
        `[Sync] Summary: Found: ${totalFound}, Added: ${syncResult.added}, Updated: ${syncResult.updated}, Unchanged: ${syncResult.unchanged}, Deactivated: ${syncResult.deactivated}, Price Changes: ${syncResult.priceChanges}`,
      );
      logger.info(`======================================================\n`);

      // 4. Record to SyncLogs sheet
      await this.sheetsService.recordSyncLog({
        syncId,
        startedAt,
        finishedAt,
        durationSeconds,
        categoriesCount,
        totalProductsFound: totalFound,
        productsAdded: syncResult.added,
        productsUpdated: syncResult.updated,
        priceChanges: syncResult.priceChanges,
        errorsCount,
        status,
      });

      return { syncId, status, result: syncResult };
    } catch (fatalError) {
      status = 'FAILED';
      const endTime = new Date();
      const finishedAt = formatVietnamTime(endTime);
      const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      logger.error(`[Sync] Fatal error during sync cycle: ${(fatalError as Error).message}`);

      try {
        await this.sheetsService.recordSyncLog({
          syncId,
          startedAt,
          finishedAt,
          durationSeconds,
          categoriesCount,
          totalProductsFound: totalFound,
          productsAdded: syncResult.added,
          productsUpdated: syncResult.updated,
          priceChanges: syncResult.priceChanges,
          errorsCount: errorsCount + 1,
          status,
        });
      } catch (logErr) {
        logger.error(`[SyncLogs] Could not log failure: ${(logErr as Error).message}`);
      }

      throw fatalError;
    } finally {
      isSyncRunning = false;
    }
  }

  /**
   * Graceful shutdown hook.
   */
  public async shutdown(): Promise<void> {
    await this.telegramService.shutdown();
  }
}
