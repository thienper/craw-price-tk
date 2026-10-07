import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { validateTelegramConfig } from '../config/env.js';
import { logger } from '../utils/logger.js';

let clientInstance: TelegramClient | null = null;

export class TelegramClientManager {
  /**
   * Returns an authenticated TelegramClient instance using TELEGRAM_SESSION from env.
   */
  public static async getClient(): Promise<TelegramClient> {
    if (clientInstance && clientInstance.connected) {
      return clientInstance;
    }

    const { apiId, apiHash, session } = validateTelegramConfig();

    const stringSession = new StringSession(session);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
      useWSS: false,
    });

    logger.info('[Telegram] Connecting to MTProto servers...');
    await client.connect();

    if (!(await client.checkAuthorization())) {
      throw new Error(
        'Telegram session is invalid or expired. Please run `npm run telegram:login` to re-authenticate.',
      );
    }

    logger.info('[Telegram] Connected & authenticated successfully.');
    clientInstance = client;
    return client;
  }

  /**
   * Gracefully disconnects the TelegramClient if active.
   */
  public static async disconnect(): Promise<void> {
    if (clientInstance) {
      logger.info('[Telegram] Disconnecting Telegram client...');
      try {
        await clientInstance.disconnect();
      } catch (err) {
        logger.warn(`[Telegram] Error during disconnect: ${(err as Error).message}`);
      } finally {
        clientInstance = null;
      }
    }
  }
}
