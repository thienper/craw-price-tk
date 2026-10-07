import { Product, ProductSchema } from './product.types.js';
import { logger } from '../utils/logger.js';

export class ProductNormalizer {
  /**
   * Validates and normalizes an array of products.
   * Invalid products are logged and excluded without causing the entire batch to fail.
   */
  public static validateAndNormalize(products: Product[]): Product[] {
    const validProducts: Product[] = [];

    for (const product of products) {
      try {
        // Enforce basic business rules
        if (!product.productName || product.productName.trim().length === 0) {
          logger.warn(
            `[ProductNormalizer] Skipped product with empty name (Raw: "${product.rawText}")`,
          );
          continue;
        }

        if (product.price < 0) {
          logger.warn(
            `[ProductNormalizer] Skipped product with negative price: ${product.price} (Raw: "${product.rawText}")`,
          );
          continue;
        }

        // Validate with Zod schema
        const validated = ProductSchema.parse(product);
        validProducts.push(validated as Product);
      } catch (error) {
        logger.error(
          `[ProductNormalizer] Product validation error for "${product.productName}": ${(error as Error).message}`,
        );
      }
    }

    return validProducts;
  }
}
