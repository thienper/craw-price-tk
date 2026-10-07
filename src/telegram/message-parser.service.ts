import { Api } from 'telegram';
import { isIgnoredButton } from '../config/telegram.config.js';
import { PriceParser } from '../products/price-parser.service.js';

export interface TelegramButton {
  text: string;
  data?: Buffer;
  url?: string;
  row: number;
  col: number;
  buttonObj: Api.TypeKeyboardButton;
}

export interface ParsedTelegramMessage {
  id: number;
  text: string;
  buttons: TelegramButton[];
  ignoredButtons: TelegramButton[];
  allButtons: TelegramButton[];
  isProductList: boolean;
  signature: string;
}

export class MessageParserService {
  /**
   * Extracts text, inline buttons, and metadata from a Telegram Message.
   */
  public static parse(message: Api.Message): ParsedTelegramMessage {
    const text = message.message || '';
    const allButtons: TelegramButton[] = [];
    const buttons: TelegramButton[] = [];
    const ignoredButtons: TelegramButton[] = [];

    if (message.replyMarkup && 'rows' in message.replyMarkup) {
      const rows = message.replyMarkup.rows;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let c = 0; c < row.buttons.length; c++) {
          const btn = row.buttons[c];
          const btnText = btn.text || '';
          const data = 'data' in btn ? (btn.data as Buffer) : undefined;
          const url = 'url' in btn ? (btn.url as string) : undefined;

          const buttonInfo: TelegramButton = {
            text: btnText,
            data,
            url,
            row: r,
            col: c,
            buttonObj: btn,
          };

          allButtons.push(buttonInfo);

          if (isIgnoredButton(btnText)) {
            ignoredButtons.push(buttonInfo);
          } else {
            buttons.push(buttonInfo);
          }
        }
      }
    }

    // Determine if this message is a product listing
    // 1. Text contains price patterns or multiple product lines
    // 2. Or buttons themselves contain prices (e.g. "GPT 1M — 395k")
    const hasPriceInText = PriceParser.extractPrice(text) !== null;
    const hasPriceInButtons = buttons.some((b) => PriceParser.extractPrice(b.text) !== null);
    const hasStockIndicator = /(?:còn \d+|hết hàng|kho:|tồn:)/i.test(text);

    const isProductList = hasPriceInText || hasPriceInButtons || hasStockIndicator;

    // Create unique signature for loop prevention
    const buttonNames = buttons.map((b) => b.text.trim()).sort().join('|');
    const signature = `${text.trim()}:::${buttonNames}`;

    return {
      id: message.id,
      text,
      buttons,
      ignoredButtons,
      allButtons,
      isProductList,
      signature,
    };
  }
}
