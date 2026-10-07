/**
 * Date and Time utilities for Asia/Ho_Chi_Minh timezone
 */

export const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Formats a Date object to "YYYY-MM-DD HH:mm:ss" in Asia/Ho_Chi_Minh timezone.
 */
export function formatVietnamTime(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // en-CA outputs "YYYY-MM-DD, HH:mm:ss" or similar
  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
}

/**
 * Returns current Date in ISO format or formatted string.
 */
export function getNowVietnam(): string {
  return formatVietnamTime(new Date());
}
