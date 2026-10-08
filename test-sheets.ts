import { GoogleAuthService } from './src/google/google-auth.service.js';
import { validateGoogleConfig } from './src/config/env.js';

async function checkAllRows() {
  const config = validateGoogleConfig();
  const sheets = GoogleAuthService.getSheetsClient();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
  });
  const sheetTitles = meta.data.sheets?.map((s) => s.properties?.title) || [];
  console.log(`Current Sheet Tabs: [${sheetTitles.join(', ')}]`);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: 'Products!A1:I500',
  });

  const rows = res.data.values || [];
  console.log(`Total rows retrieved: ${rows.length}`);
  let emptyRows: number[] = [];
  rows.forEach((r, idx) => {
    const isBlank = !r || r.length === 0 || r.every((c) => !c || c.toString().trim() === '');
    if (isBlank) {
      emptyRows.push(idx + 1);
    }
  });

  console.log(`Empty rows count: ${emptyRows.length}`);
  if (emptyRows.length > 0) {
    console.log(`Empty rows: ${emptyRows.slice(0, 30).join(', ')}${emptyRows.length > 30 ? '...' : ''}`);
  }

  console.log('\n--- Rows 30 to 42 ---');
  rows.slice(29, 42).forEach((r, idx) => {
    console.log(`Row ${idx + 30}: [${r[0] || ''}] ${r[1]} | ${r[6]} | ${r[7]} | ID=${r[8]}`);
  });

  console.log('\n--- Rows 55 to 85 ---');
  rows.slice(54, 85).forEach((r, idx) => {
    console.log(`Row ${idx + 55}: [${r[0] || ''}] ${r[1]} | ${r[6]} | ${r[7]} | ID=${r[8]}`);
  });

  console.log('\n--- Sample middle/tail rows ---');
  rows.slice(-10).forEach((r, idx) => {
    console.log(`Row ${rows.length - 10 + idx + 1}: [${r[0] || ''}] ${r[1]} | ${r[6]} | ${r[7]}`);
  });

  const syncLogsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: 'SyncLogs!A1:K10',
  });
  const syncRows = syncLogsRes.data.values || [];
  console.log(`\nSyncLogs total rows: ${syncRows.length}`);
  syncRows.forEach((r, idx) => {
    console.log(`SyncLogs Row ${idx + 1}: ${JSON.stringify(r)}`);
  });
}

checkAllRows().catch(console.error);
