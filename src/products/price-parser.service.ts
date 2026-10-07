export class PriceParser {
  // Matches explicit currency: 395,000đ, 395,000₫, 395.000đ, 395000đ, 395,000 vnđ, etc.
  private static readonly CURRENCY_REGEX =
    /(?:^|\s|[—\-|:])(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(?:[đ₫]|vnd|vnđ|đồng|dong)(?![a-zA-Z0-9])/i;

  // Matches "k" notation: 395k, 2600k
  private static readonly K_NOTATION_REGEX =
    /(?:^|\s|[—\-|:])(\d{1,3}(?:[.,]\d{3})*|\d+)\s*[kK]\b/;

  // Matches formatted numbers with thousand separators after delimiters: — 395,000 or - 2.600.000
  private static readonly DELIMITER_PRICE_REGEX =
    /[—\-|:]\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?!\s*[a-zA-Z0-9])/;

  // Matches any standalone formatted number with thousand separators: 395,000 or 2.600.000
  private static readonly STANDALONE_FORMATTED_REGEX =
    /\b(\d{1,3}(?:[.,]\d{3})+)\b/;

  /**
   * Parses a price string into a numeric value.
   * Handles formats:
   * 395,000đ | 395.000đ | 395000đ | 395,000 | 395.000 | 395k
   */
  public static extractPrice(text: string): number | null {
    // 1. Check with currency symbol (đ, vnd, vnđ)
    const currencyMatch = text.match(this.CURRENCY_REGEX);
    if (currencyMatch && currencyMatch[1]) {
      const parsed = this.cleanAndParseNumber(currencyMatch[1]);
      if (parsed !== null && parsed > 0) return parsed;
    }

    // 2. Check "k" suffix (395k -> 395000)
    const kMatch = text.match(this.K_NOTATION_REGEX);
    if (kMatch && kMatch[1]) {
      const parsed = this.cleanAndParseNumber(kMatch[1]);
      if (parsed !== null && parsed > 0) return parsed * 1000;
    }

    // 3. Check number after delimiters (—, -, |, :)
    const delimMatch = text.match(this.DELIMITER_PRICE_REGEX);
    if (delimMatch && delimMatch[1]) {
      const parsed = this.cleanAndParseNumber(delimMatch[1]);
      if (parsed !== null && parsed > 0) return parsed;
    }

    // 4. Check standalone thousand-separated numbers
    const standaloneMatch = text.match(this.STANDALONE_FORMATTED_REGEX);
    if (standaloneMatch && standaloneMatch[1]) {
      const parsed = this.cleanAndParseNumber(standaloneMatch[1]);
      if (parsed !== null && parsed > 0) return parsed;
    }

    return null;
  }

  /**
   * Strips thousand separators (. or ,) and parses into an integer.
   */
  public static cleanAndParseNumber(raw: string): number | null {
    if (!raw) return null;

    // Remove all dots, commas, spaces, currency symbols
    const cleaned = raw.replace(/[.,\s]/g, '').trim();
    if (!/^\d+$/.test(cleaned)) {
      return null;
    }

    const value = parseInt(cleaned, 10);
    return isNaN(value) ? null : value;
  }
}
