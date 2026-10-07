import { Product } from './product.types.js';
import { WarrantyParser } from './warranty-parser.service.js';
import { DurationParser } from './duration-parser.service.js';
import { PriceParser } from './price-parser.service.js';
import { StockParser } from './stock-parser.service.js';
import { ProductIdGenerator } from './product-id.generator.js';

export interface ParseProductInput {
  rawText: string;
  category: string;
  subcategory?: string | null;
  source?: string;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
}

export class ProductParser {
  // Known variant keywords that can appear outside parentheses
  private static readonly VARIANT_KEYWORDS = [
    'ready acc',
    'ready account',
    'bussiness',
    'business',
    'personal',
    'chính chủ',
    'chinh chu',
    'mail riêng',
    'mail rieng',
    'your mail',
    'shared',
    'private',
    'gia hạn',
    'gia han',
    'cấp mới',
    'cap moi',
    'slot',
    'family',
    'invitation',
    'invite',
  ];

  /**
   * Cleans up raw text, collapses multiple whitespace, removes emoji prefixes.
   */
  public static normalizeText(text: string): string {
    return text
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width chars
      .replace(/^[❌🔥⚡⭐📦🛍️✨\s]+/gu, '') // strip leading status emojis
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Main parsing method to transform raw product line into structured Product.
   */
  public static parse(input: ParseProductInput): Product | null {
    const rawText = input.rawText;
    const normalized = this.normalizeText(rawText);

    if (!normalized) return null;

    // 1. Extract stock & status
    const stockInfo = StockParser.extractStock(normalized);

    // 2. Extract price
    const price = PriceParser.extractPrice(normalized) ?? 0;

    // 3. Extract warranty
    const warrantyInfo = WarrantyParser.extractWarranty(normalized);

    // 4. Extract duration
    const durationInfo = DurationParser.extractDuration(normalized, warrantyInfo.warrantyCode);

    // 5. Extract product name & variant
    const { productName, variant } = this.extractProductNameAndVariant(
      normalized,
      warrantyInfo.warrantyCode,
      durationInfo.rawMatched,
      stockInfo.rawMatched,
    );

    // Determine final dates
    const now = input.lastSeenAt || new Date();
    const firstSeenAt = input.firstSeenAt || now;

    const category = input.category.trim();
    const subcategory = input.subcategory ? input.subcategory.trim() : null;

    // 6. Generate deterministic ID
    const id = ProductIdGenerator.generate({
      category,
      subcategory,
      productName,
      variant,
      duration: durationInfo.duration,
      warrantyCode: warrantyInfo.warrantyCode,
    });

    return {
      id,
      category,
      subcategory,
      productName,
      variant,
      duration: durationInfo.duration,
      warrantyCode: warrantyInfo.warrantyCode,
      warranty: warrantyInfo.warranty,
      price,
      stock: stockInfo.stock,
      stockStatus: stockInfo.stockStatus,
      rawText,
      source: input.source || 'Telegram',
      active: true,
      firstSeenAt,
      lastSeenAt: now,
    };
  }

  /**
   * Extracts clean product name and variant from text.
   */
  public static extractProductNameAndVariant(
    text: string,
    warrantyCode: string | null,
    durationRaw?: string,
    stockRaw?: string,
  ): { productName: string; variant: string | null } {
    let clean = text;

    // Remove stock portion if present
    if (stockRaw) {
      clean = clean.replace(stockRaw, ' ');
    } else {
      clean = clean.replace(/\((?:còn|kho|tồn|hết|hết hàng|sold out)[^)]*\)/gi, ' ');
    }

    // Split text by price delimiter: —, –, |, :, or whitespace before price
    const delimiterMatch = clean.match(/\s*(?:—|–|\||\s-\s|:\s*)\s*/);
    let titlePart = delimiterMatch && delimiterMatch.index !== undefined
      ? clean.substring(0, delimiterMatch.index)
      : clean;

    // If no delimiter was present, strip trailing currency pattern
    if (!delimiterMatch) {
      titlePart = titlePart.replace(/\s*\d{1,3}(?:[.,]\d{3})*\s*(?:đ|vnd|vnđ|đồng|dong)\b.*$/i, '');
    }

    let extractedVariant: string | null = null;

    // Check for parentheses in titlePart: e.g. (business FW), (ready acc), (W2D)
    const parenMatches = [...titlePart.matchAll(/\(([^)]+)\)/g)];
    for (const match of parenMatches) {
      const fullMatch = match[0];
      let inside = match[1].trim();

      // If it contains warranty code, remove it
      if (warrantyCode) {
        inside = inside.replace(new RegExp(`\\b${warrantyCode}\\b`, 'gi'), '').trim();
      }

      // Check if anything remains inside parentheses (e.g. "business")
      if (inside.length > 0 && !extractedVariant) {
        extractedVariant = inside.toLowerCase() === 'bussiness' ? 'business' : inside;
      }

      // Remove the entire parenthesized group from title
      titlePart = titlePart.replace(fullMatch, ' ');
    }

    // Remove duration if matched e.g. "1M", "24M"
    if (durationRaw) {
      titlePart = titlePart.replace(new RegExp(`\\b${durationRaw}\\b`, 'gi'), ' ');
    }

    // Check if remaining title ends with or contains known variants
    if (!extractedVariant) {
      for (const kw of this.VARIANT_KEYWORDS) {
        const kwRegex = new RegExp(`\\b${kw}\\b`, 'i');
        if (kwRegex.test(titlePart)) {
          extractedVariant = kw.toLowerCase() === 'bussiness' ? 'business' : kw;
          titlePart = titlePart.replace(kwRegex, ' ');
          break;
        }
      }
    }

    // Clean up residual characters and whitespace
    let productName = titlePart
      .replace(/[—–|:_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Fallback if productName became empty
    if (!productName) {
      productName = text.split(/[—–|]/)[0]?.trim() || 'Sản phẩm';
    }

    return {
      productName,
      variant: extractedVariant,
    };
  }
}
