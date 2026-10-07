import { TelegramClientManager } from './telegram.client.js';
import { MenuCrawlerService, CrawlerStats, CategoryProductsCallback } from './menu-crawler.service.js';
import { validateTelegramConfig } from '../config/env.js';
import { Product } from '../products/product.types.js';
import { logger } from '../utils/logger.js';

export class TelegramService {
  /**
   * Crawls products from the configured Telegram bot with real-time category streaming.
   */
  public async crawlProducts(
    onCategoryCrawled?: CategoryProductsCallback,
  ): Promise<{ products: Product[]; stats: CrawlerStats }> {
    const { botUsername } = validateTelegramConfig();
    const client = await TelegramClientManager.getClient();

    logger.info(`[TelegramService] Connecting to bot @${botUsername}...`);
    const crawler = new MenuCrawlerService(client, botUsername);
    return await crawler.crawl(onCategoryCrawled);
  }

  /**
   * Closes the active Telegram connection.
   */
  public async shutdown(): Promise<void> {
    await TelegramClientManager.disconnect();
  }
}
