import { describe, it, expect } from 'vitest';
import { WarrantyParser } from './warranty-parser.service.js';
import { DurationParser } from './duration-parser.service.js';
import { PriceParser } from './price-parser.service.js';
import { StockParser } from './stock-parser.service.js';
import { ProductParser } from './product-parser.service.js';
import { ProductIdGenerator } from './product-id.generator.js';

describe('WarrantyParser', () => {
  it('should parse special codes FW and NW', () => {
    expect(WarrantyParser.parseCode('FW')).toBe('Bảo hành đầy đủ');
    expect(WarrantyParser.parseCode('NW')).toBe('Không bảo hành');
  });

  it('should parse dynamic warranty codes (W5H, W2D, W4M, W1Y)', () => {
    expect(WarrantyParser.parseCode('W5H')).toBe('Bảo hành 5 giờ');
    expect(WarrantyParser.parseCode('W2D')).toBe('Bảo hành 2 ngày');
    expect(WarrantyParser.parseCode('W4M')).toBe('Bảo hành 4 tháng');
    expect(WarrantyParser.parseCode('W1Y')).toBe('Bảo hành 1 năm');
    expect(WarrantyParser.parseCode('W7D')).toBe('Bảo hành 7 ngày');
  });

  it('should extract warranty from raw text with parentheses', () => {
    const res1 = WarrantyParser.extractWarranty('GPT TEAM (business FW) — 395,000đ');
    expect(res1.warrantyCode).toBe('FW');
    expect(res1.warranty).toBe('Bảo hành đầy đủ');

    const res2 = WarrantyParser.extractWarranty('GPT PRO X20 1M (W2D) — 2,600,000đ');
    expect(res2.warrantyCode).toBe('W2D');
    expect(res2.warranty).toBe('Bảo hành 2 ngày');

    const res3 = WarrantyParser.extractWarranty('GPT K12 Edu 24M (W5H)');
    expect(res3.warrantyCode).toBe('W5H');
    expect(res3.warranty).toBe('Bảo hành 5 giờ');
  });
});

describe('DurationParser', () => {
  it('should parse code durations 1D, 7D, 1M, 24M, 1Y, 2Y', () => {
    expect(DurationParser.extractDuration('GPT PRO X20 1M (W2D)').duration).toBe('1 tháng');
    expect(DurationParser.extractDuration('GPT K12 Edu 24M (W5H)').duration).toBe('24 tháng');
    expect(DurationParser.extractDuration('Canva Pro 1Y (FW)').duration).toBe('1 năm');
    expect(DurationParser.extractDuration('Account trial 7D (W7D)').duration).toBe('7 ngày');
  });

  it('should not confuse warranty codes like W2D or W5H with duration', () => {
    const res = DurationParser.extractDuration('GPT TEAM (FW)', 'FW');
    expect(res.duration).toBeNull();

    const res2 = DurationParser.extractDuration('Account (W2D)', 'W2D');
    expect(res2.duration).toBeNull();
  });

  it('should parse Vietnamese word durations', () => {
    expect(DurationParser.extractDuration('Netflix Premium 6 tháng').duration).toBe('6 tháng');
    expect(DurationParser.extractDuration('Spotify 1 năm').duration).toBe('1 năm');
  });
});

describe('PriceParser', () => {
  it('should parse formatted Vietnamese currency', () => {
    expect(PriceParser.extractPrice('GPT TEAM (business FW) — 395,000đ (còn 308)')).toBe(395000);
    expect(PriceParser.extractPrice('GPT TEAM (business FW) — 395.000đ (còn 308)')).toBe(395000);
    expect(PriceParser.extractPrice('GPT TEAM (business FW) — 395000đ (còn 308)')).toBe(395000);
    expect(PriceParser.extractPrice('GPT TEAM (business FW) — 395,000 (còn 308)')).toBe(395000);
    expect(PriceParser.extractPrice('GPT TEAM (business FW) — 395.000 (còn 308)')).toBe(395000);
    expect(PriceParser.extractPrice('GPT PRO X20 1M (W2D) — 2,600,000đ (hết hàng)')).toBe(2600000);
  });

  it('should handle cleanAndParseNumber correctly', () => {
    expect(PriceParser.cleanAndParseNumber('395,000')).toBe(395000);
    expect(PriceParser.cleanAndParseNumber('2.600.000')).toBe(2600000);
    expect(PriceParser.cleanAndParseNumber('500000')).toBe(500000);
  });
});

describe('StockParser', () => {
  it('should parse in-stock numbers', () => {
    const res1 = StockParser.extractStock('GPT TEAM (business FW) — 395,000đ (còn 308)');
    expect(res1.stock).toBe(308);
    expect(res1.stockStatus).toBe('IN_STOCK');

    const res2 = StockParser.extractStock('Account (còn 4)');
    expect(res2.stock).toBe(4);
    expect(res2.stockStatus).toBe('IN_STOCK');
  });

  it('should parse out of stock status', () => {
    const res = StockParser.extractStock('GPT PRO X20 1M (W2D) — 2,600,000đ (hết hàng)');
    expect(res.stock).toBe(0);
    expect(res.stockStatus).toBe('OUT_OF_STOCK');
  });

  it('should return UNKNOWN when stock is not mentioned', () => {
    const res = StockParser.extractStock('GPT PRO 1M — 500,000đ');
    expect(res.stock).toBeNull();
    expect(res.stockStatus).toBe('UNKNOWN');
  });
});

describe('ProductIdGenerator', () => {
  it('should generate consistent deterministic 16-character hash', () => {
    const id1 = ProductIdGenerator.generate({
      category: 'ChatGPT',
      subcategory: null,
      productName: 'GPT TEAM',
      variant: 'business',
      duration: null,
      warrantyCode: 'FW',
    });

    const id2 = ProductIdGenerator.generate({
      category: 'chatgpt',
      subcategory: null,
      productName: 'gpt team',
      variant: 'BUSINESS',
      duration: null,
      warrantyCode: 'fw',
    });

    expect(id1).toHaveLength(16);
    expect(id1).toBe(id2);
  });
});

describe('ProductParser (Full parse test)', () => {
  it('should parse "GPT TEAM (business FW) — 395,000đ (còn 308)" correctly', () => {
    const result = ProductParser.parse({
      rawText: 'GPT TEAM (business FW) — 395,000đ (còn 308)',
      category: 'ChatGPT',
    });

    expect(result).not.toBeNull();
    expect(result?.category).toBe('ChatGPT');
    expect(result?.subcategory).toBeNull();
    expect(result?.productName).toBe('GPT TEAM');
    expect(result?.variant).toBe('business');
    expect(result?.duration).toBeNull();
    expect(result?.warrantyCode).toBe('FW');
    expect(result?.warranty).toBe('Bảo hành đầy đủ');
    expect(result?.price).toBe(395000);
    expect(result?.stock).toBe(308);
    expect(result?.stockStatus).toBe('IN_STOCK');
    expect(result?.rawText).toBe('GPT TEAM (business FW) — 395,000đ (còn 308)');
  });

  it('should parse "GPT PRO X20 1M (W2D) — 2,600,000đ (hết hàng)" correctly', () => {
    const result = ProductParser.parse({
      rawText: 'GPT PRO X20 1M (W2D) — 2,600,000đ (hết hàng)',
      category: 'ChatGPT',
    });

    expect(result).not.toBeNull();
    expect(result?.category).toBe('ChatGPT');
    expect(result?.productName).toBe('GPT PRO X20');
    expect(result?.duration).toBe('1 tháng');
    expect(result?.warrantyCode).toBe('W2D');
    expect(result?.warranty).toBe('Bảo hành 2 ngày');
    expect(result?.price).toBe(2600000);
    expect(result?.stock).toBe(0);
    expect(result?.stockStatus).toBe('OUT_OF_STOCK');
  });

  it('should parse "GPT K12 Edu 24M (W5H) — 69,000đ (còn 219)" correctly', () => {
    const result = ProductParser.parse({
      rawText: 'GPT K12 Edu 24M (W5H) — 69,000đ (còn 219)',
      category: 'ChatGPT',
    });

    expect(result).not.toBeNull();
    expect(result?.productName).toBe('GPT K12 Edu');
    expect(result?.duration).toBe('24 tháng');
    expect(result?.warrantyCode).toBe('W5H');
    expect(result?.warranty).toBe('Bảo hành 5 giờ');
    expect(result?.price).toBe(69000);
    expect(result?.stock).toBe(219);
    expect(result?.stockStatus).toBe('IN_STOCK');
  });

  it('should parse "GPT plus 4M ready acc (NW) — 500,000đ (còn 13)" correctly', () => {
    const result = ProductParser.parse({
      rawText: 'GPT plus 4M ready acc (NW) — 500,000đ (còn 13)',
      category: 'ChatGPT',
    });

    expect(result).not.toBeNull();
    expect(result?.productName).toBe('GPT plus');
    expect(result?.variant).toBe('ready acc');
    expect(result?.duration).toBe('4 tháng');
    expect(result?.warrantyCode).toBe('NW');
    expect(result?.warranty).toBe('Không bảo hành');
    expect(result?.price).toBe(500000);
    expect(result?.stock).toBe(13);
    expect(result?.stockStatus).toBe('IN_STOCK');
  });
});
