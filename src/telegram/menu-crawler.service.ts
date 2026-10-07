import { TelegramClient, Api } from 'telegram';
import { isIgnoredButton, isProductButton } from '../config/telegram.config.js';
import { sleep } from '../utils/delay.js';
import { retryWithBackoff } from '../utils/retry.js';
import { logger } from '../utils/logger.js';
import { MessageParserService, TelegramButton } from './message-parser.service.js';
import { ProductParser } from '../products/product-parser.service.js';
import { Product } from '../products/product.types.js';

export interface CrawlerStats {
  categoriesCrawled: number;
  productsFound: number;
  errorsCount: number;
  errorMessages: string[];
}

export interface CategoryPageItem {
  cleanName: string;
  button: TelegramButton;
  page: number;
}

export type CategoryProductsCallback = (
  products: Product[],
  categoryName: string,
) => Promise<void>;

export class MenuCrawlerService {
  private client: TelegramClient;
  private botUsername: string;
  private discoveredProducts: Product[] = [];
  private currentPage = 1;
  private stats: CrawlerStats = {
    categoriesCrawled: 0,
    productsFound: 0,
    errorsCount: 0,
    errorMessages: [],
  };

  constructor(client: TelegramClient, botUsername: string) {
    this.client = client;
    this.botUsername = botUsername;
  }

  /**
   * Main entry point to crawl products with real-time category streaming.
   */
  public async crawl(
    onCategoryCrawled?: CategoryProductsCallback,
  ): Promise<{ products: Product[]; stats: CrawlerStats }> {
    this.discoveredProducts = [];
    this.stats = {
      categoriesCrawled: 0,
      productsFound: 0,
      errorsCount: 0,
      errorMessages: [],
    };

    logger.info(`[Crawler] Starting crawl for bot @${this.botUsername}...`);
    const botEntity = await this.client.getEntity(this.botUsername);

    // 1. Navigate to the Products Category menu ("Danh mục")
    const categoryMenu = await this.navigateToCategoryMenu(botEntity);
    if (!categoryMenu) {
      throw new Error(`Could not access "Danh mục" menu for @${this.botUsername}`);
    }

    // 2. Discover all product categories across all pages (Page 1 + Page 2 via "Sau ➡️")
    const allCategories = await this.collectAllCategoriesAcrossPages(categoryMenu, botEntity);
    logger.info(
      `[Crawler] Successfully discovered ${allCategories.length} product categories across all pages!`,
    );

    this.stats.categoriesCrawled = allCategories.length;

    // 3. Reset cleanly to Page 1 of Category Menu before beginning item-by-item crawling
    await this.navigateToCategoryMenu(botEntity);
    this.currentPage = 1;
    await sleep(1000);

    // 4. Crawl each category one by one
    for (let i = 0; i < allCategories.length; i++) {
      const item = allCategories[i];
      const cleanCategoryName = item.cleanName;

      logger.info(
        `\n[Crawler] (${i + 1}/${allCategories.length}) [Page ${item.page}] Opening category: [${cleanCategoryName}]...`,
      );

      try {
        const categoryProducts = await this.crawlSingleCategory(
          botEntity,
          item,
        );

        logger.info(
          `[Crawler] Found ${categoryProducts.length} product(s) in [${cleanCategoryName}].`,
        );

        // REAL-TIME STREAMING: Write to Google Sheets immediately!
        if (onCategoryCrawled && categoryProducts.length > 0) {
          await onCategoryCrawled(categoryProducts, cleanCategoryName);
        }

        // Add to aggregate list
        for (const p of categoryProducts) {
          this.addProductIfNotExists(p);
        }
      } catch (catError) {
        this.stats.errorsCount++;
        const errMsg = `Error crawling category [${cleanCategoryName}]: ${(catError as Error).message}`;
        this.stats.errorMessages.push(errMsg);
        logger.error(`[Crawler] ${errMsg}. Continuing to next category...`);

        // If error, reset to category menu
        await this.navigateToCategoryMenu(botEntity);
        this.currentPage = 1;
      }

      await sleep(800);
    }

    this.stats.productsFound = this.discoveredProducts.length;
    logger.info(
      `\n[Crawler] Full crawl finished! Total products found: ${this.stats.productsFound} across ${this.stats.categoriesCrawled} categories (${this.stats.errorsCount} errors).`,
    );

    return {
      products: this.discoveredProducts,
      stats: this.stats,
    };
  }

  /**
   * Navigates directly into the product catalog menu ("Danh mục") at Page 1.
   */
  private async navigateToCategoryMenu(botEntity: Api.TypeEntityLike): Promise<Api.Message | null> {
    await this.client.sendMessage(botEntity, { message: '/start' });
    await sleep(1500);

    let msgs = await this.client.getMessages(botEntity, { limit: 1 });
    let msg = msgs[0];
    if (!msg) return null;

    let parsed = MessageParserService.parse(msg);

    // If language selection is presented, choose Tiếng Việt
    const viBtn = parsed.allButtons.find((b) => /tiếng việt|vietnam|vn/i.test(b.text));
    if (viBtn) {
      await this.clickButton(msg, viBtn, botEntity);
      await sleep(1500);

      msgs = await this.client.getMessages(botEntity, { limit: 1 });
      msg = msgs[0];
      parsed = MessageParserService.parse(msg);
    }

    // If there is a "Danh mục" button, click it
    const dmBtn = parsed.allButtons.find(
      (b) => !isIgnoredButton(b.text) && /danh mục/i.test(b.text),
    );
    if (dmBtn) {
      await this.clickButton(msg, dmBtn, botEntity);
      await sleep(1500);

      msgs = await this.client.getMessages(botEntity, { limit: 1 });
      msg = msgs[0];
    }

    this.currentPage = 1;
    return msg;
  }

  /**
   * Scans and collects categories across all pagination pages (e.g. Page 1, Page 2 via "Sau ➡️").
   */
  private async collectAllCategoriesAcrossPages(
    initialMenuMsg: Api.Message,
    botEntity: Api.TypeEntityLike,
  ): Promise<CategoryPageItem[]> {
    const categories: CategoryPageItem[] = [];
    const seenNames = new Set<string>();
    let currentMsg = initialMenuMsg;
    let page = 1;

    while (page <= 5) {
      const parsed = MessageParserService.parse(currentMsg);

      for (const btn of parsed.allButtons) {
        if (!isIgnoredButton(btn.text) && !isProductButton(btn.text)) {
          const clean = btn.text.replace(/^[❌🔥⚡⭐📦🛍️✨\s]+/gu, '').trim();
          if (clean && !seenNames.has(clean)) {
            seenNames.add(clean);
            categories.push({
              cleanName: clean,
              button: btn,
              page,
            });
          }
        }
      }

      // Check if there is a Next Page button ("Sau ➡️")
      const nextBtn = parsed.allButtons.find((b) => /sau\s*➡️|trang sau|next/i.test(b.text));
      if (nextBtn) {
        await this.clickButton(currentMsg, nextBtn, botEntity);
        await sleep(1500);

        const msgs = await this.client.getMessages(botEntity, { limit: 1 });
        if (msgs[0] && msgs[0].id !== currentMsg.id) {
          currentMsg = msgs[0];
          page++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return categories;
  }

  /**
   * Crawls a single category: ensures correct page, clicks category, extracts products, and clicks Back.
   */
  private async crawlSingleCategory(
    botEntity: Api.TypeEntityLike,
    item: CategoryPageItem,
  ): Promise<Product[]> {
    let msgs = await this.client.getMessages(botEntity, { limit: 1 });
    let currentMsg = msgs[0];
    if (!currentMsg) return [];

    let parsed = MessageParserService.parse(currentMsg);

    // Ensure we are on the correct page for this category
    if (item.page === 2 && this.currentPage === 1) {
      const nextBtn = parsed.allButtons.find((b) => /sau\s*➡️|trang sau|next/i.test(b.text));
      if (nextBtn) {
        await this.clickButton(currentMsg, nextBtn, botEntity);
        await sleep(1200);
        msgs = await this.client.getMessages(botEntity, { limit: 1 });
        currentMsg = msgs[0];
        parsed = MessageParserService.parse(currentMsg);
        this.currentPage = 2;
      }
    } else if (item.page === 1 && this.currentPage === 2) {
      const prevBtn = parsed.allButtons.find((b) => /⬅️\s*trước|trang trước|prev/i.test(b.text));
      if (prevBtn) {
        await this.clickButton(currentMsg, prevBtn, botEntity);
        await sleep(1200);
        msgs = await this.client.getMessages(botEntity, { limit: 1 });
        currentMsg = msgs[0];
        parsed = MessageParserService.parse(currentMsg);
        this.currentPage = 1;
      }
    }

    // Re-locate category button on current message by matching clean name
    let targetBtn = parsed.allButtons.find((b) => {
      const clean = b.text.replace(/^[❌🔥⚡⭐📦🛍️✨\s]+/gu, '').trim();
      return clean.toLowerCase() === item.cleanName.toLowerCase();
    });

    // Fallback: If not found on current screen, reset cleanly to Category Menu
    if (!targetBtn) {
      logger.warn(`[Crawler] Button [${item.cleanName}] not visible. Resetting to Category Menu...`);
      currentMsg = (await this.navigateToCategoryMenu(botEntity)) || currentMsg;
      if (item.page === 2) {
        const p1Parsed = MessageParserService.parse(currentMsg);
        const nextBtn = p1Parsed.allButtons.find((b) => /sau\s*➡️|trang sau|next/i.test(b.text));
        if (nextBtn) {
          await this.clickButton(currentMsg, nextBtn, botEntity);
          await sleep(1200);
          msgs = await this.client.getMessages(botEntity, { limit: 1 });
          currentMsg = msgs[0];
        }
        this.currentPage = 2;
      } else {
        this.currentPage = 1;
      }
      parsed = MessageParserService.parse(currentMsg);
      targetBtn = parsed.allButtons.find((b) => {
        const clean = b.text.replace(/^[❌🔥⚡⭐📦🛍️✨\s]+/gu, '').trim();
        return clean.toLowerCase() === item.cleanName.toLowerCase();
      });
    }

    if (!targetBtn) {
      logger.error(`[Crawler] Could not find button for category [${item.cleanName}]. Skipping.`);
      return [];
    }

    // Click category button
    await this.clickButton(currentMsg, targetBtn, botEntity);
    await sleep(1500);

    // Read category response
    let catMsgs = await this.client.getMessages(botEntity, { limit: 1 });
    let responseMsg = catMsgs[0];
    if (!responseMsg) return [];

    let responseParsed = MessageParserService.parse(responseMsg);

    // If no product buttons found immediately, wait another 1200ms in case the bot is updating
    let productButtons = responseParsed.allButtons.filter((b) => isProductButton(b.text));
    if (productButtons.length === 0) {
      await sleep(1200);
      catMsgs = await this.client.getMessages(botEntity, { limit: 1 });
      responseMsg = catMsgs[0];
      responseParsed = MessageParserService.parse(responseMsg);
    }

    const categoryProducts: Product[] = [];

    // Extract all products from buttons
    for (const btn of responseParsed.allButtons) {
      if (isIgnoredButton(btn.text)) continue;

      if (isProductButton(btn.text)) {
        const product = ProductParser.parse({
          rawText: btn.text,
          category: item.cleanName,
          source: `@${this.botUsername}`,
        });

        if (product && product.price > 0) {
          categoryProducts.push(product);
        }
      }
    }

    // Also check text lines in case some products are in message text
    const textLines = responseParsed.text.split('\n');
    for (const rawLine of textLines) {
      const line = rawLine.trim();
      if (isProductButton(line)) {
        const product = ProductParser.parse({
          rawText: line,
          category: item.cleanName,
          source: `@${this.botUsername}`,
        });

        if (product && product.price > 0 && !categoryProducts.some((p) => p.id === product.id)) {
          categoryProducts.push(product);
        }
      }
    }

    // Click "🔙 Quay lại" to return to category list
    const backBtn = responseParsed.allButtons.find((b) => /quay lại|back|trở lại|🔙/i.test(b.text));
    if (backBtn) {
      await this.clickButton(responseMsg, backBtn, botEntity);
      await sleep(1200);
    } else {
      // Fallback: reset to category menu
      await this.navigateToCategoryMenu(botEntity);
      this.currentPage = 1;
    }

    return categoryProducts;
  }

  /**
   * Clicks an inline button safely with callback invocation.
   */
  private async clickButton(
    msg: Api.Message,
    button: TelegramButton,
    botEntity: Api.TypeEntityLike,
  ): Promise<void> {
    await retryWithBackoff(
      async () => {
        try {
          if (button.data) {
            await this.client.invoke(
              new Api.messages.GetBotCallbackAnswer({
                peer: botEntity,
                msgId: msg.id,
                data: button.data,
              }),
            );
          } else {
            await msg.click({ i: button.row, j: button.col });
          }
        } catch (err) {
          logger.debug(`[Crawler] Click warning: ${(err as Error).message}`);
        }
      },
      {
        maxRetries: 3,
        label: `Click "${button.text}"`,
      },
    );
  }

  private addProductIfNotExists(product: Product): void {
    const exists = this.discoveredProducts.some((p) => p.id === product.id);
    if (!exists) {
      this.discoveredProducts.push(product);
    }
  }
}
