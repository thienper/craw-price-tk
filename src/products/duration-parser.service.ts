export interface DurationResult {
  duration: string | null;
  rawMatched?: string;
}

const UNIT_MAP: Record<string, string> = {
  H: 'giờ',
  D: 'ngày',
  M: 'tháng',
  Y: 'năm',
};

export class DurationParser {
  // Matches standalone durations like 1D, 7D, 1M, 3M, 6M, 12M, 24M, 1Y, 2Y
  // Ensures not preceded by W/w (to avoid matching warranty codes like W2D, W4M)
  private static readonly CODE_DURATION_REGEX =
    /(?:^|[^a-zA-Z0-9])(?<![wW])(\d+)\s*([dmyDMY])(?![a-zA-Z0-9])/;

  // Matches Vietnamese word durations: "1 ngày", "24 tháng", "1 năm", "6 tháng"
  private static readonly WORD_DURATION_REGEX =
    /\b(\d+)\s*(ngày|tháng|năm|giờ|ngay|thang|nam|gio)\b/i;

  // Matches lifetime keywords
  private static readonly LIFETIME_REGEX = /\b(lifetime|vĩnh viễn|vinh vien)\b/i;

  /**
   * Extracts product duration from a string (excluding warranty code).
   */
  public static extractDuration(text: string, warrantyCode?: string | null): DurationResult {
    // If a warranty code is known, temporarily mask it so it doesn't interfere
    let cleanText = text;
    if (warrantyCode) {
      cleanText = cleanText.replace(new RegExp(`\\b${warrantyCode}\\b`, 'gi'), '');
    }

    // Also remove any parentheses that contain 'W' codes just in case
    cleanText = cleanText.replace(/\(W\d+[HDMY]\)/gi, '');

    // Check lifetime
    if (this.LIFETIME_REGEX.test(cleanText)) {
      return { duration: 'Vĩnh viễn' };
    }

    // Check Vietnamese words first (e.g. "12 tháng", "1 năm")
    const wordMatch = cleanText.match(this.WORD_DURATION_REGEX);
    if (wordMatch && wordMatch[1] && wordMatch[2]) {
      const num = wordMatch[1];
      const unit = wordMatch[2].toLowerCase();
      let normalizedUnit = unit;
      if (unit.startsWith('ng')) normalizedUnit = 'ngày';
      else if (unit.startsWith('th')) normalizedUnit = 'tháng';
      else if (unit.startsWith('na')) normalizedUnit = 'năm';
      else if (unit.startsWith('gi')) normalizedUnit = 'giờ';
      return {
        duration: `${num} ${normalizedUnit}`,
        rawMatched: wordMatch[0],
      };
    }

    // Check code format (e.g. "1M", "24M", "1Y", "7D")
    const codeMatch = cleanText.match(this.CODE_DURATION_REGEX);
    if (codeMatch && codeMatch[1] && codeMatch[2]) {
      const amount = codeMatch[1];
      const unit = codeMatch[2].toUpperCase();
      const unitLabel = UNIT_MAP[unit];
      if (unitLabel) {
        return {
          duration: `${amount} ${unitLabel}`,
          rawMatched: codeMatch[0].trim(),
        };
      }
    }

    return { duration: null };
  }
}
