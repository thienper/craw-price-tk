import { sheets_v4 } from 'googleapis';
import { GoogleAuthService } from './google-auth.service.js';
import { validateGoogleConfig } from '../config/env.js';
import {
  GOOGLE_SHEET_NAMES,
  PRODUCTS_SHEET_HEADERS,
  PRICE_HISTORY_SHEET_HEADERS,
  SYNC_LOGS_SHEET_HEADERS,
} from '../config/google.config.js';
import { Product } from '../products/product.types.js';
import { formatVietnamTime } from '../utils/date.js';
import { retryWithBackoff } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

export interface PriceHistoryRecord {
  productId: string;
  productName: string;
  category: string;
  oldPrice: number;
  newPrice: number;
  difference: number;
  changedAt: string;
}

export interface SyncLogRecord {
  syncId: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  categoriesCount: number;
  totalProductsFound: number;
  productsAdded: number;
  productsUpdated: number;
  priceChanges: number;
  errorsCount: number;
  status: 'SUCCESS' | 'SUCCESS_WITH_ERRORS' | 'FAILED';
}

export interface SheetsSyncResult {
  added: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  priceChanges: number;
}

interface ExistingProductCache {
  rowIndex: number;
  row: string[];
  price: number;
  stock: number | null;
}

export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;
  private productsSheetName: string;
  private productsSheetId: number | null = null;
  private existingProductsMap = new Map<string, ExistingProductCache>();
  private nextRowIndex = 2;

  constructor() {
    const config = validateGoogleConfig();
    this.spreadsheetId = config.spreadsheetId;
    this.productsSheetName = config.sheetName || GOOGLE_SHEET_NAMES.PRODUCTS;
    this.sheets = GoogleAuthService.getSheetsClient();
  }

  /**
   * Initializes required sheets and headers if they do not exist.
   */
  public async ensureSheetsInitialized(): Promise<void> {
    await retryWithBackoff(
      async () => {
        logger.info('[GoogleSheets] Verifying sheets structure...');
        const meta = await this.sheets.spreadsheets.get({
          spreadsheetId: this.spreadsheetId,
        });

        const existingSheets = new Map<string, number>();
        meta.data.sheets?.forEach((s) => {
          if (s.properties?.title && typeof s.properties.sheetId === 'number') {
            existingSheets.set(s.properties.title, s.properties.sheetId);
          }
        });

        const requiredSheets: { name: string; headers: readonly string[] }[] = [
          { name: this.productsSheetName, headers: PRODUCTS_SHEET_HEADERS },
          { name: GOOGLE_SHEET_NAMES.PRICE_HISTORY, headers: PRICE_HISTORY_SHEET_HEADERS },
          { name: GOOGLE_SHEET_NAMES.SYNC_LOGS, headers: SYNC_LOGS_SHEET_HEADERS },
        ];

        const requests: sheets_v4.Schema$Request[] = [];

        for (const sheet of requiredSheets) {
          if (!existingSheets.has(sheet.name)) {
            logger.info(`[GoogleSheets] Creating missing sheet: "${sheet.name}"`);
            requests.push({
              addSheet: {
                properties: {
                  title: sheet.name,
                  gridProperties: { rowCount: 1000, columnCount: 15 },
                },
              },
            });
          }
        }

        if (requests.length > 0) {
          const res = await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: { requests },
          });

          res.data.replies?.forEach((reply) => {
            const added = reply.addSheet?.properties;
            if (added?.title && typeof added.sheetId === 'number') {
              existingSheets.set(added.title, added.sheetId);
            }
          });
        }

        this.productsSheetId = existingSheets.get(this.productsSheetName) ?? null;

        // Ensure headers are written for each sheet
        for (const sheet of requiredSheets) {
          const colLetter = String.fromCharCode(64 + sheet.headers.length);
          const headerRange = `${sheet.name}!A1:${colLetter}1`;
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: headerRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [[...sheet.headers]],
            },
          });
        }
      },
      { label: 'GoogleSheets:ensureSheetsInitialized' },
    );
  }

  /**
   * Resets/clears the Products sheet completely (wiping both values and all cell formats/backgrounds).
   */
  public async resetProductsSheet(): Promise<void> {
    await this.ensureSheetsInitialized();
    const sheetId = this.productsSheetId;

    logger.info('[GoogleSheets] Wiping Products sheet completely clean (values + formatting)...');

    // 1. Clear all values from A2 downwards
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `${this.productsSheetName}!A2:Z`,
    });

    if (sheetId !== null) {
      // 2. Unmerge all cells from row 1 to 1000 and clear userEnteredFormat on all cells
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              unmergeCells: {
                range: {
                  sheetId,
                  startRowIndex: 1,
                  endRowIndex: 1000,
                  startColumnIndex: 0,
                  endColumnIndex: 15,
                },
              },
            },
            {
              updateCells: {
                range: {
                  sheetId,
                  startRowIndex: 1,
                  endRowIndex: 1000,
                  startColumnIndex: 0,
                  endColumnIndex: 15,
                },
                fields: 'userEnteredFormat',
              },
            },
          ],
        },
      });
    }

    // 3. Rewrite clean headers to row 1
    const colLetter = String.fromCharCode(64 + PRODUCTS_SHEET_HEADERS.length);
    const headerRange = `${this.productsSheetName}!A1:${colLetter}1`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: headerRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[...PRODUCTS_SHEET_HEADERS]],
      },
    });

    this.nextRowIndex = 2;
  }

  /**
   * Loads existing products into memory cache.
   * Maps Column I (index 8) as ID, Column G (index 6) as Price, Column H (index 7) as Stock.
   */
  public async loadExistingCache(): Promise<void> {
    await this.ensureSheetsInitialized();

    const range = `${this.productsSheetName}!A2:I`;
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const rows = res.data.values || [];
    this.existingProductsMap.clear();

    rows.forEach((row, index) => {
      const id = row[8]?.toString().trim(); // Column I is hidden ID
      if (id) {
        const price = parseInt(row[6] || '0', 10); // Column G is Giá nhập
        const stockRaw = row[7]?.toString().trim() || '';
        let stock: number | null = null;
        if (stockRaw) {
          const match = stockRaw.match(/\d+/);
          stock = match ? parseInt(match[0], 10) : stockRaw.includes('Hết') ? 0 : null;
        }

        this.existingProductsMap.set(id, {
          rowIndex: index + 2,
          row,
          price: isNaN(price) ? 0 : price,
          stock,
        });
      }
    });

    this.nextRowIndex = rows.length + 2;
    logger.info(
      `[GoogleSheets] Cache loaded with ${this.existingProductsMap.size} existing product(s).`,
    );
  }

  /**
   * Synchronizes a batch of products from one category directly into Google Sheets in real-time.
   */
  public async syncCategoryProducts(products: Product[]): Promise<{
    added: number;
    updated: number;
    unchanged: number;
    priceChanges: number;
  }> {
    if (products.length === 0) {
      return { added: 0, updated: 0, unchanged: 0, priceChanges: 0 };
    }

    const nowFormatted = formatVietnamTime();
    const newRowsToAppend: string[][] = [];
    const batchUpdateData: sheets_v4.Schema$ValueRange[] = [];
    const priceHistoryEntries: PriceHistoryRecord[] = [];

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    for (const product of products) {
      const existing = this.existingProductsMap.get(product.id);

      if (!existing) {
        const row = this.productToRow(product);
        newRowsToAppend.push(row);

        this.existingProductsMap.set(product.id, {
          rowIndex: this.nextRowIndex++,
          row,
          price: product.price,
          stock: product.stock !== undefined ? product.stock : null,
        });

        added++;
      } else {
        const priceChanged = existing.price !== product.price;
        const stockChanged = existing.stock !== product.stock;

        if (priceChanged) {
          const diff = product.price - existing.price;
          priceHistoryEntries.push({
            productId: product.id,
            productName: product.productName,
            category: product.category,
            oldPrice: existing.price,
            newPrice: product.price,
            difference: diff,
            changedAt: nowFormatted,
          });
        }

        if (priceChanged || stockChanged) {
          const updatedRow = this.productToRow(product);

          batchUpdateData.push({
            range: `${this.productsSheetName}!A${existing.rowIndex}:I${existing.rowIndex}`,
            values: [updatedRow],
          });

          existing.price = product.price;
          existing.stock = product.stock !== undefined ? product.stock : null;
          existing.row = updatedRow;

          updated++;
        } else {
          unchanged++;
        }
      }
    }

    if (batchUpdateData.length > 0) {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: batchUpdateData,
        },
      });
    }

    if (newRowsToAppend.length > 0) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.productsSheetName}!A2`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: newRowsToAppend,
        },
      });
    }

    if (priceHistoryEntries.length > 0) {
      await this.recordPriceHistory(priceHistoryEntries);
    }

    return { added, updated, unchanged, priceChanges: priceHistoryEntries.length };
  }

  /**
   * Finalizes the sync cycle:
   * Sets out-of-stock products for missing items and applies vibrant formatting & category merges.
   */
  public async finalizeSync(seenProductIds: Set<string>): Promise<number> {
    logger.info('[GoogleSheets] Finalizing sync & applying beautiful styling & merges...');

    let deactivatedCount = 0;
    const batchUpdateData: sheets_v4.Schema$ValueRange[] = [];

    // For products in cache that were NOT seen during this full crawl, mark stock as Hết hàng
    for (const [id, cached] of this.existingProductsMap.entries()) {
      if (!seenProductIds.has(id) && (cached.stock === null || cached.stock > 0)) {
        cached.stock = 0;
        cached.row[7] = 'Hết hàng'; // Column H is Tồn kho
        batchUpdateData.push({
          range: `${this.productsSheetName}!H${cached.rowIndex}:H${cached.rowIndex}`,
          values: [['Hết hàng']],
        });
        deactivatedCount++;
      }
    }

    if (batchUpdateData.length > 0) {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: batchUpdateData,
        },
      });
    }

    // Apply harmonious styling, clear white backgrounds, bold red/green stock, +1 font size, and category merges
    await this.applyFormattingAndMerges();

    return deactivatedCount;
  }

  /**
   * Applies harmonious, comfortable styling:
   * - Clean white data background (no eye-straining dark blue)
   * - Increased font size by +1 (Headers 11pt, Data 11pt, Category 12pt, Row height 34px)
   * - Category column: Soft blue pastel #EFF6FF, dark navy text, vertically merged
   * - Stock column: Crisp Green badge for "Còn hàng", Crisp Red badge for "Hết hàng"
   * - Currency VND format on Giá nhập
   * - Thin light gray borders
   * - Wipes any leftover formatting below the last row
   */
  public async applyFormattingAndMerges(): Promise<void> {
    if (this.productsSheetId === null) {
      await this.ensureSheetsInitialized();
    }
    const sheetId = this.productsSheetId;
    if (sheetId === null) return;

    logger.info('[GoogleSheets] Applying harmonious formatting, colors, +1 font size & category merges...');

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.productsSheetName}!A1:I`,
    });

    const rows = res.data.values || [];
    const totalRows = rows.length;

    const requests: sheets_v4.Schema$Request[] = [
      // 1. Freeze Header Row
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      },

      // 2. Header Style: Deep Royal Navy #1E3A8A, White Bold, Centered, Font Size 11pt
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 8, // Visible columns 0..7
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.12, green: 0.23, blue: 0.54 }, // #1E3A8A
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                fontSize: 11, // Increased to 11pt
                bold: true,
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
        },
      },

      // 3. Header Row Height: 40px
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 40 },
          fields: 'pixelSize',
        },
      },

      // 4. Column Widths (Optimized to fit with 11pt text)
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 125 }, // Danh mục
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
          properties: { pixelSize: 280 }, // Tên dịch vụ
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
          properties: { pixelSize: 120 }, // Phiên bản/Gói
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
          properties: { pixelSize: 95 }, // Thời hạn
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
          properties: { pixelSize: 90 }, // Mã BH
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 },
          properties: { pixelSize: 150 }, // Bảo hành
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 },
          properties: { pixelSize: 115 }, // Giá nhập
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 },
          properties: { pixelSize: 115 }, // Tồn kho
          fields: 'pixelSize',
        },
      },

      // 5. Hide Column I (ID - Index 8)
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 },
          properties: { hiddenByUser: true },
          fields: 'hiddenByUser',
        },
      },
    ];

    if (totalRows > 1) {
      // 6. Data Row Heights: 34px (roomy for 11pt font)
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: totalRows },
          properties: { pixelSize: 34 },
          fields: 'pixelSize',
        },
      });

      // 7. CRITICAL RESET: Set data cells to Pure White / subtle zebra with 11pt dark slate text
      for (let r = 1; r < totalRows; r++) {
        const isEven = r % 2 === 0;
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: r,
              endRowIndex: r + 1,
              startColumnIndex: 1, // Columns 1..7 (Tên dịch vụ to Tồn kho)
              endColumnIndex: 8,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: isEven
                  ? { red: 1.0, green: 1.0, blue: 1.0 } // White #FFFFFF
                  : { red: 0.98, green: 0.985, blue: 0.99 }, // Very soft slate #F8FAFC
                textFormat: {
                  fontSize: 11, // Increased to 11pt
                  foregroundColor: { red: 0.12, green: 0.16, blue: 0.23 }, // Dark Slate #1E293B
                },
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
          },
        });
      }

      // 8. Service Name (Col 1): Left-align
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 1,
            endColumnIndex: 2,
          },
          cell: {
            userEnteredFormat: { horizontalAlignment: 'LEFT' },
          },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });

      // 9. Centered columns: Phiên bản (2), Thời hạn (3), Mã BH (4), Bảo hành (5)
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 2,
            endColumnIndex: 6,
          },
          cell: {
            userEnteredFormat: { horizontalAlignment: 'CENTER' },
          },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      });

      // Mã BH (Col 4): Bold font
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 4,
            endColumnIndex: 5,
          },
          cell: {
            userEnteredFormat: { textFormat: { bold: true, fontSize: 11 } },
          },
          fields: 'userEnteredFormat(textFormat)',
        },
      });

      // 10. Price Column (Col 6): Currency format #,##0 ₫, Bold, 11pt, Right-align, Dark Blue #1E40AF
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 6,
            endColumnIndex: 7,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              textFormat: {
                bold: true,
                fontSize: 11,
                foregroundColor: { red: 0.118, green: 0.251, blue: 0.686 }, // #1E40AF
              },
              numberFormat: {
                type: 'CURRENCY',
                pattern: '#,##0 "₫"',
              },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,textFormat,numberFormat)',
        },
      });

      // 11. Stock Column (Col 7): Highlight "Còn [N]" (Green) vs "Hết hàng" (Red), 11pt bold
      for (let r = 1; r < totalRows; r++) {
        const rawStock = rows[r][7]?.toString().trim() || '';
        const isOutOfStock =
          rawStock === '' ||
          rawStock.includes('Hết') ||
          rawStock === '0' ||
          rawStock === 'OUT_OF_STOCK';

        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: r,
              endRowIndex: r + 1,
              startColumnIndex: 7,
              endColumnIndex: 8,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                backgroundColor: isOutOfStock
                  ? { red: 0.996, green: 0.886, blue: 0.886 } // Soft Pastel Red #FEE2E2
                  : { red: 0.863, green: 0.988, blue: 0.906 }, // Soft Pastel Green #DCFCE7
                textFormat: {
                  bold: true,
                  fontSize: 11, // 11pt
                  foregroundColor: isOutOfStock
                    ? { red: 0.863, green: 0.149, blue: 0.149 } // Dark Red #DC2626
                    : { red: 0.082, green: 0.502, blue: 0.239 }, // Dark Green #15803D
                },
              },
            },
            fields: 'userEnteredFormat(horizontalAlignment,backgroundColor,textFormat)',
          },
        });
      }

      // 12. Solid Crisp Borders for entire visible table
      requests.push({
        updateBorders: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: totalRows,
            startColumnIndex: 0,
            endColumnIndex: 8,
          },
          top: { style: 'SOLID', color: { red: 0.8, green: 0.84, blue: 0.88 } },
          bottom: { style: 'SOLID', color: { red: 0.8, green: 0.84, blue: 0.88 } },
          left: { style: 'SOLID', color: { red: 0.8, green: 0.84, blue: 0.88 } },
          right: { style: 'SOLID', color: { red: 0.8, green: 0.84, blue: 0.88 } },
          innerHorizontal: { style: 'SOLID', color: { red: 0.886, green: 0.910, blue: 0.941 } },
          innerVertical: { style: 'SOLID', color: { red: 0.886, green: 0.910, blue: 0.941 } },
        },
      });

      // 13. Unmerge column A first to avoid merge collisions
      requests.push({
        unmergeCells: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 0,
            endColumnIndex: 1,
          },
        },
      });

      // 14. Merge Category (Col 0) cells vertically for identical consecutive values!
      let currentCategory = '';
      let catStartRow = 1;

      for (let r = 1; r < totalRows; r++) {
        const cat = (rows[r][0] || '').trim();
        if (cat !== currentCategory) {
          if (currentCategory && r - catStartRow > 1) {
            requests.push({
              mergeCells: {
                range: {
                  sheetId,
                  startRowIndex: catStartRow,
                  endRowIndex: r,
                  startColumnIndex: 0,
                  endColumnIndex: 1,
                },
                mergeType: 'MERGE_ALL',
              },
            });
          }
          currentCategory = cat;
          catStartRow = r;
        }
      }

      if (currentCategory && totalRows - catStartRow > 1) {
        requests.push({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: catStartRow,
              endRowIndex: totalRows,
              startColumnIndex: 0,
              endColumnIndex: 1,
            },
            mergeType: 'MERGE_ALL',
          },
        });
      }

      // 15. Category Column (Col 0) Style: Soft Ice Blue #EFF6FF, Dark Cobalt Text, Bold 12pt, Centered
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 0,
            endColumnIndex: 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.937, green: 0.965, blue: 1.0 }, // #EFF6FF
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              textFormat: {
                bold: true,
                fontSize: 12, // Increased to 12pt
                foregroundColor: { red: 0.114, green: 0.306, blue: 0.847 }, // #1D4ED8
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)',
        },
      });

      // 16. WIPE ANY GHOST FORMATTING / BACKGROUNDS BELOW totalRows
      requests.push(
        {
          unmergeCells: {
            range: {
              sheetId,
              startRowIndex: totalRows,
              endRowIndex: 1000,
              startColumnIndex: 0,
              endColumnIndex: 15,
            },
          },
        },
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: totalRows,
              endRowIndex: 1000,
              startColumnIndex: 0,
              endColumnIndex: 15,
            },
            fields: 'userEnteredFormat',
          },
        },
      );
    }

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });
    logger.info('✅ [GoogleSheets] Formatting, colors, +1 font size & category merges successfully applied!');
  }

  /**
   * Appends price changes to PriceHistory sheet.
   */
  public async recordPriceHistory(entries: PriceHistoryRecord[]): Promise<void> {
    if (entries.length === 0) return;

    const values = entries.map((e) => [
      e.productId,
      e.productName,
      e.category,
      e.oldPrice,
      e.newPrice,
      e.difference > 0 ? `+${e.difference}` : `${e.difference}`,
      e.changedAt,
    ]);

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${GOOGLE_SHEET_NAMES.PRICE_HISTORY}!A2`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  }

  /**
   * Records a sync run summary into SyncLogs sheet.
   */
  public async recordSyncLog(log: SyncLogRecord): Promise<void> {
    await this.ensureSheetsInitialized();

    const row = [
      log.syncId,
      log.startedAt,
      log.finishedAt,
      `${log.durationSeconds}s`,
      log.categoriesCount,
      log.totalProductsFound,
      log.productsAdded,
      log.productsUpdated,
      log.priceChanges,
      log.errorsCount,
      log.status,
    ];

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${GOOGLE_SHEET_NAMES.SYNC_LOGS}!A2`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [row],
        },
      });
      logger.info(`[SyncLogs] Recorded run [${log.syncId}] status: ${log.status}`);
    } catch (err) {
      logger.error(`[SyncLogs] Failed to record log: ${(err as Error).message}`);
    }
  }

  /**
   * Converts a Product entity into a streamlined spreadsheet row array.
   */
  private productToRow(product: Product): string[] {
    const stockText =
      product.stock !== null && product.stock !== undefined && product.stock > 0
        ? `Còn ${product.stock}`
        : 'Hết hàng';

    return [
      product.category,
      product.productName,
      product.variant || '',
      product.duration || '',
      product.warrantyCode || '',
      product.warranty || '',
      product.price.toString(),
      stockText,
      product.id, // Column I (index 8) - hidden
    ];
  }
}
