export interface WarrantyResult {
  warrantyCode: string | null;
  warranty: string | null;
}

const UNIT_MAP: Record<string, string> = {
  H: 'giờ',
  D: 'ngày',
  M: 'tháng',
  Y: 'năm',
};

export class WarrantyParser {
  private static readonly DYNAMIC_WARRANTY_REGEX = /^W(\d+)([HDMY])$/i;
  private static readonly INLINE_CODE_REGEX = /\b(FW|NW|W\d+[HDMY])\b/i;

  /**
   * Translates a clean warranty code (e.g. "FW", "W2D", "W5H") to human-readable Vietnamese.
   */
  public static parseCode(code: string): string | null {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return null;

    if (trimmed === 'FW') {
      return 'Bảo hành đầy đủ';
    }

    if (trimmed === 'NW') {
      return 'Không bảo hành';
    }

    const match = trimmed.match(this.DYNAMIC_WARRANTY_REGEX);
    if (match && match[1] && match[2]) {
      const amount = match[1];
      const unitKey = match[2].toUpperCase();
      const unit = UNIT_MAP[unitKey];
      if (unit) {
        return `Bảo hành ${amount} ${unit}`;
      }
    }

    return null;
  }

  /**
   * Extracts warranty code and text from a raw product string.
   */
  public static extractWarranty(text: string): WarrantyResult {
    const match = text.match(this.INLINE_CODE_REGEX);
    if (!match || !match[1]) {
      return { warrantyCode: null, warranty: null };
    }

    const code = match[1].toUpperCase();
    const warranty = this.parseCode(code);

    return {
      warrantyCode: code,
      warranty,
    };
  }
}
