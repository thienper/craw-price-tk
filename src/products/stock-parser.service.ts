import { StockStatus } from './product.types.js';

export interface StockResult {
  stock: number | null;
  stockStatus: StockStatus;
  rawMatched?: string;
}

export class StockParser {
  // Matches out of stock indicators: (hết hàng), hết hàng, sold out, out of stock
  private static readonly OUT_OF_STOCK_REGEX =
    /(?:\((?:hết hàng|hết|sold out|out of stock|tạm hết)\)|(?:hết hàng|sold out|out of stock|tạm hết)\b)/i;

  // Matches in stock counts: (còn 308), còn 308, kho: 308, tồn: 308, stock: 308, qty: 308
  private static readonly IN_STOCK_REGEX =
    /(?:\((?:còn|kho|tồn|stock|qty|sl|số lượng)[:\s]*(\d+)\)|(?:còn|kho|tồn|stock|qty|sl|số lượng)[:\s]+(\d+)\b)/i;

  /**
   * Extracts stock quantity and stock status from raw text.
   */
  public static extractStock(text: string): StockResult {
    // 1. Check out of stock keywords first
    const outMatch = text.match(this.OUT_OF_STOCK_REGEX);
    if (outMatch) {
      return {
        stock: 0,
        stockStatus: 'OUT_OF_STOCK',
        rawMatched: outMatch[0],
      };
    }

    // 2. Check in stock with quantity
    const inMatch = text.match(this.IN_STOCK_REGEX);
    if (inMatch) {
      const quantityStr = inMatch[1] || inMatch[2];
      if (quantityStr) {
        const stock = parseInt(quantityStr, 10);
        return {
          stock,
          stockStatus: stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
          rawMatched: inMatch[0],
        };
      }
    }

    // 3. Fallback: stock not mentioned
    return {
      stock: null,
      stockStatus: 'UNKNOWN',
    };
  }
}
