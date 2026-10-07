import { env } from './env.js';

/**
 * Patterns to identify buttons that should NOT be crawled as product categories
 * (e.g. navigation, actions, cart, wallet, language, settings, cancellations)
 */
export const IGNORED_BUTTON_PATTERNS: RegExp[] = [
  /(quay lại|back|trở lại|«|‹|<-|<|🔙|↩️|◀️)/i,
  /(trang chủ|home|menu chính|main menu|start)/i,
  /(giỏ hàng|cart|đơn hàng|orders|lịch sử)/i,
  /(ví|wallet|nạp tiền|rút tiền|topup|số dư|balance)/i,
  /(api key|tạo key|thu hồi|revoke)/i,
  /(ngôn ngữ|language|tiếng việt|english|chinese|russian)/i,
  /(mua ngay|đặt mua|mua|buy|order|thanh toán|payment|checkout)/i,
  /(hủy|cancel|close|đóng|thoát|exit|xong|done)/i,
  /^[+\-–—]$/,
  /(xác nhận|confirm|chấp nhận|đồng ý)/i,
  /(hỗ trợ|support|admin|liên hệ|contact)/i,
  /(thông tin|info|hướng dẫn|guide|chính sách|policy)/i,
  /(làm mới|refresh|reload|🔄)/i,
  /(sau ➡️|⬅️ trước|tiếp theo|trang sau|trang trước)/i,
];

/**
 * Determines whether a button text matches ignored navigation/action patterns.
 */
export function isIgnoredButton(text: string): boolean {
  if (!text) return true;

  const rawTrimmed = text.trim();
  const clean = rawTrimmed
    .replace(/[\p{Emoji}\u200B-\u200D\uFEFF]/gu, '')
    .trim()
    .toLowerCase();

  if (!clean) return true;

  return IGNORED_BUTTON_PATTERNS.some(
    (pattern) => pattern.test(clean) || pattern.test(rawTrimmed),
  );
}

/**
 * Determines whether an inline button is an actual product (not a category or action).
 */
export function isProductButton(text: string): boolean {
  if (!text) return false;
  // Has stock patterns: (còn 306), (hết hàng)
  if (/(?:còn\s*\d+|hết\s*hàng|kho:|tồn:|sold\s*out)/i.test(text)) return true;
  // Has price patterns with delimiter: — 395,000₫, - 2.600.000
  if (/[—–-]\s*\d{1,3}(?:[.,]\d{3})+/i.test(text)) return true;
  // Has currency symbol: 395,000₫ or 395.000đ
  if (/\d{1,3}(?:[.,]\d{3})+\s*[đ₫vnd]/i.test(text)) return true;
  return false;
}

export const telegramConfig = {
  minDelayMs: env.TELEGRAM_MIN_DELAY,
  maxDelayMs: env.TELEGRAM_MAX_DELAY,
  responseTimeoutMs: env.TELEGRAM_RESPONSE_TIMEOUT,
  ignoredButtonPatterns: IGNORED_BUTTON_PATTERNS,
};
