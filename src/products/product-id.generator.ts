import { createHash } from 'crypto';

export interface ProductIdInput {
  category: string;
  subcategory?: string | null;
  productName: string;
  variant?: string | null;
  duration?: string | null;
  warrantyCode?: string | null;
}

export class ProductIdGenerator {
  /**
   * Generates a deterministic 16-character SHA-256 hash ID for a product.
   * Ensures identical products receive the same ID across different crawl sessions.
   */
  public static generate(input: ProductIdInput): string {
    const normalize = (val?: string | null): string =>
      val ? val.trim().toLowerCase().replace(/\s+/g, ' ') : '';

    const payload = [
      normalize(input.category),
      normalize(input.subcategory),
      normalize(input.productName),
      normalize(input.variant),
      normalize(input.duration),
      normalize(input.warrantyCode),
    ].join('|');

    return createHash('sha256').update(payload).digest('hex').substring(0, 16);
  }
}
