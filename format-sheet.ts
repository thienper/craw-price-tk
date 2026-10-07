import { GoogleSheetsService } from './src/google/google-sheets.service.js';

async function main() {
  console.log('Đang khởi tạo GoogleSheetsService...');
  const sheetsService = new GoogleSheetsService();
  await sheetsService.applyFormattingAndMerges();
  console.log('✅ Định dạng màu sắc và gộp ô danh mục hoàn tất thành công!');
}

main().catch(console.error);
