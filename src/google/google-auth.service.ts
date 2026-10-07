import { google, sheets_v4 } from 'googleapis';
import { validateGoogleConfig } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class GoogleAuthService {
  private static sheetsClient: sheets_v4.Sheets | null = null;

  /**
   * Initializes and returns an authorized Google Sheets API client using Service Account credentials.
   */
  public static getSheetsClient(): sheets_v4.Sheets {
    if (this.sheetsClient) {
      return this.sheetsClient;
    }

    const { clientEmail, privateKey } = validateGoogleConfig();

    logger.info('[GoogleAuth] Authenticating Google Service Account...');

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheetsClient = google.sheets({ version: 'v4', auth });
    return this.sheetsClient;
  }
}
