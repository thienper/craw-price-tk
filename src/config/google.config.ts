export const GOOGLE_SHEET_NAMES = {
  PRODUCTS: 'Products',
  PRICE_HISTORY: 'PriceHistory',
  SYNC_LOGS: 'SyncLogs',
} as const;

export const PRODUCTS_SHEET_HEADERS = [
  'Danh mục',
  'Tên dịch vụ',
  'Phiên bản/Gói',
  'Thời hạn',
  'Mã bảo hành',
  'Bảo hành',
  'Giá nhập',
  'Tồn kho',
  'ID',
] as const;

export const PRICE_HISTORY_SHEET_HEADERS = [
  'Product ID',
  'Tên dịch vụ',
  'Danh mục',
  'Giá cũ',
  'Giá mới',
  'Chênh lệch',
  'Thời gian thay đổi',
] as const;

export const SYNC_LOGS_SHEET_HEADERS = [
  'Sync ID',
  'Bắt đầu',
  'Kết thúc',
  'Thời gian chạy',
  'Danh mục',
  'Tổng SP tìm thấy',
  'SP thêm mới',
  'SP cập nhật',
  'Thay đổi giá',
  'Số lỗi',
  'Trạng thái',
] as const;
