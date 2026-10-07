import { GoogleAuthService } from './src/google/google-auth.service.js';
import { validateGoogleConfig } from './src/config/env.js';

async function checkTailRows() {
  const config = validateGoogleConfig();
  const sheets = GoogleAuthService.getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: 'Products!A190:H210',
  });

  const rows = res.data.values || [];
  console.log(`Found ${rows.length} rows in A190:H210:`);
  rows.forEach((r, i) => {
    console.log(`${i + 190}. [${r[0] || ''}] ${r[1]} | ${r[6]} | ${r[7]}`);
  });
}

checkTailRows().catch(console.error);
