import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Telegram
  TELEGRAM_API_ID: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  TELEGRAM_API_HASH: z.string().optional(),
  TELEGRAM_SESSION: z.string().optional().default(''),
  TELEGRAM_BOT_USERNAME: z.string().optional().default(''),

  // Google Sheets
  GOOGLE_SPREADSHEET_ID: z.string().optional().default(''),
  GOOGLE_SHEET_NAME: z.string().optional().default('Products'),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional().default(''),
  GOOGLE_PRIVATE_KEY: z.string().optional().default(''),

  // Scheduler & Behavior
  SYNC_CRON: z.string().default('0 * * * *'),
  SYNC_ON_START: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  TZ: z.string().default('Asia/Ho_Chi_Minh'),

  // Telegram Crawler Delays (ms)
  TELEGRAM_MIN_DELAY: z
    .string()
    .optional()
    .default('1200')
    .transform((val) => parseInt(val, 10)),
  TELEGRAM_MAX_DELAY: z
    .string()
    .optional()
    .default('2500')
    .transform((val) => parseInt(val, 10)),
  TELEGRAM_RESPONSE_TIMEOUT: z
    .string()
    .optional()
    .default('15000')
    .transform((val) => parseInt(val, 10)),
});

const parsedEnv = envSchema.parse(process.env);

export const env = parsedEnv;

/**
 * Validates that all required Telegram credentials exist for syncing.
 */
export function validateTelegramConfig(): {
  apiId: number;
  apiHash: string;
  session: string;
  botUsername: string;
} {
  if (!env.TELEGRAM_API_ID || isNaN(env.TELEGRAM_API_ID)) {
    throw new Error('TELEGRAM_API_ID is required and must be a valid number in .env');
  }
  if (!env.TELEGRAM_API_HASH) {
    throw new Error('TELEGRAM_API_HASH is required in .env');
  }
  if (!env.TELEGRAM_SESSION) {
    throw new Error(
      'TELEGRAM_SESSION is missing. Please run `npm run telegram:login` first to authenticate.',
    );
  }
  if (!env.TELEGRAM_BOT_USERNAME) {
    throw new Error('TELEGRAM_BOT_USERNAME is required in .env (e.g. @my_seller_bot)');
  }

  // Normalize username by stripping @ if present
  const botUsername = env.TELEGRAM_BOT_USERNAME.startsWith('@')
    ? env.TELEGRAM_BOT_USERNAME.substring(1)
    : env.TELEGRAM_BOT_USERNAME;

  return {
    apiId: env.TELEGRAM_API_ID,
    apiHash: env.TELEGRAM_API_HASH,
    session: env.TELEGRAM_SESSION,
    botUsername,
  };
}

/**
 * Validates that all required Google Sheets credentials exist.
 */
export function validateGoogleConfig(): {
  spreadsheetId: string;
  sheetName: string;
  clientEmail: string;
  privateKey: string;
} {
  if (!env.GOOGLE_SPREADSHEET_ID) {
    throw new Error('GOOGLE_SPREADSHEET_ID is required in .env');
  }
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is required in .env');
  }
  if (!env.GOOGLE_PRIVATE_KEY) {
    throw new Error('GOOGLE_PRIVATE_KEY is required in .env');
  }

  // Handle literal "\n" strings in private key
  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  return {
    spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
    sheetName: env.GOOGLE_SHEET_NAME,
    clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey,
  };
}
