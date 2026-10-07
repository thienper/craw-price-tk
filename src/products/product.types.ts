import { z } from 'zod';

export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';

export interface Product {
  id: string;
  category: string;
  subcategory?: string | null;
  productName: string;
  variant?: string | null;
  duration?: string | null;
  warrantyCode?: string | null;
  warranty?: string | null;
  price: number;
  stock?: number | null;
  stockStatus: StockStatus;
  rawText: string;
  source: string;
  active?: boolean;
  firstSeenAt?: Date;
  lastSeenAt: Date;
}

export const ProductSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().nullable().optional(),
  productName: z.string().min(1),
  variant: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  warrantyCode: z.string().nullable().optional(),
  warranty: z.string().nullable().optional(),
  price: z.number().min(0),
  stock: z.number().nullable().optional(),
  stockStatus: z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'UNKNOWN']),
  rawText: z.string().min(1),
  source: z.string().min(1),
  active: z.boolean().optional().default(true),
  firstSeenAt: z.date().optional(),
  lastSeenAt: z.date(),
});

export interface CrawledMenuItem {
  text: string;
  data?: Buffer | string;
  url?: string;
}

export interface CrawledMenuNode {
  path: string[];
  messageText: string;
  items: CrawledMenuItem[];
}
