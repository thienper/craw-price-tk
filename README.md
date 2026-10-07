# Telegram Product Crawler → Google Sheets Sync

Hệ thống Node.js / TypeScript production-ready tự động crawl toàn bộ danh mục sản phẩm/dịch vụ từ Telegram Bot thông qua MTProto Telegram cá nhân, chuẩn hóa thông tin (Tên dịch vụ, phiên bản, thời hạn, mã bảo hành, giá nhập, tồn kho, trạng thái), và đồng bộ thông minh lên Google Sheets mỗi 1 giờ kèm theo lịch sử biến động giá (`PriceHistory`) và nhật ký chạy (`SyncLogs`).

---

## 🌟 Tính Năng Nổi Bật

1. **Kết Nối MTProto Cá Nhân (GramJS)**:
   - Đọc trực tiếp các Telegram Bot bán hàng của bên thứ ba mà không cần quyền Admin hay Bot Token.
   - Hỗ trợ đăng nhập linh hoạt bằng **Quét mã QR trực tiếp trên Terminal** hoặc **Số điện thoại + OTP + 2FA**.
   - Lưu session tự động vào `.env`, không cần đăng nhập lại ở những lần chạy sau.

2. **Duyệt Menu Đệ Quy Tự Động (Recursive DFS Crawler)**:
   - Tự động duyệt qua cây menu nhiều tầng không giới hạn độ sâu.
   - Bỏ qua các nút điều hướng/hành động mua hàng (`Quay lại`, `Back`, `Trang chủ`, `Mua`, `Thanh toán`, `+`, `-`,...).
   - Chống vòng lặp vô hạn (Infinite Loop Prevention) với chữ ký `visitedMenus`.

3. **An Toàn Rate-Limit & Flood Wait**:
   - Random delay từ `1200ms` đến `2500ms` giữa các thao tác.
   - Bắt chính xác lỗi Telegram `FLOOD_WAIT` và tự động tạm dừng đúng số giây Telegram yêu cầu trước khi retry.
   - Retry tối đa 3 lần với thuật toán Exponential Backoff (`1s`, `2s`, `4s`).

4. **Bộ Parser Thông Minh & Khả Năng Kháng Lỗi Cao**:
   - **Bảo hành (`WarrantyParser`)**: Nhận diện `FW` (Đầy đủ), `NW` (Không bảo hành) và dynamic regex `W(\d+)(H|D|M|Y)` (ví dụ `W5H` -> Bảo hành 5 giờ, `W2D` -> Bảo hành 2 ngày, `W4M` -> Bảo hành 4 tháng, `W1Y` -> Bảo hành 1 năm).
   - **Thời hạn (`DurationParser`)**: Bóc tách riêng biệt `1M`, `24M`, `1Y`, `7D`,... không bị nhầm lẫn với mã bảo hành.
   - **Giá tiền (`PriceParser`)**: Xử lý `395,000đ`, `395.000đ`, `395000đ`, `395,000`, `395k`,... về kiểu `number`.
   - **Tồn kho (`StockParser`)**: Bóc tách `(còn 308)`, `(còn 4)` -> `IN_STOCK`; `(hết hàng)` -> `OUT_OF_STOCK`; nếu không có số liệu -> `UNKNOWN`.
   - **Mã định danh duy nhất (`ProductIdGenerator`)**: SHA-256 (16 ký tự) từ `category + subcategory + productName + variant + duration + warrantyCode` giúp cập nhật đúng sản phẩm cũ mà không sinh dòng trùng lặp.

5. **Đồng Bộ Dữ Liệu Lên Google Sheets (Google Sheets API v4)**:
   - **Không Append Trùng Lặp**: Đọc toàn bộ sản phẩm hiện tại, so sánh ID để UPDATE dòng cũ thay vì tạo thêm dòng mới.
   - **Sản phẩm bị gỡ**: Đánh dấu `Active = FALSE` (không xóa dữ liệu).
   - **Lịch sử giá (`PriceHistory`)**: Tự động ghi lại giá cũ, giá mới, mức chênh lệch và thời gian nếu phát hiện giá thay đổi.
   - **Nhật ký đồng bộ (`SyncLogs`)**: Lưu lại thời gian chạy, thời lượng, số sản phẩm tìm thấy/thêm mới/cập nhật/thay đổi giá.
   - **Múi giờ**: Chuẩn hóa toàn bộ thời gian theo `Asia/Ho_Chi_Minh` (GMT+7).

6. **Lập Lịch Tự Động & Chống Chạy Trùng**:
   - Sử dụng `node-cron` chạy định kỳ mỗi 1 giờ (`0 * * * *`).
   - Cơ chế Lock đảm bảo nếu lượt chạy trước chưa xong thì lượt tiếp theo sẽ được bỏ qua an toàn.
   - Tùy chọn `SYNC_ON_START=true` giúp đồng bộ ngay 1 lần khi server vừa bật mà không phải chờ sang đầu giờ.

---

## 📁 Cấu Trúc Dự Án

```
.
├── src/
│   ├── config/
│   │   ├── env.ts                   # Quản lý & validate biến môi trường bằng Zod
│   │   ├── telegram.config.ts       # Cấu hình delay, patterns các nút cần bỏ qua
│   │   └── google.config.ts         # Cấu hình tên sheet, header các cột
│   │
│   ├── telegram/
│   │   ├── telegram.client.ts       # Khởi tạo & quản lý TelegramClient (MTProto)
│   │   ├── telegram.auth.ts         # Đăng nhập tương tác (QR Code / SĐT + OTP + 2FA)
│   │   ├── telegram.service.ts      # Facade điều phối crawl Telegram
│   │   ├── menu-crawler.service.ts  # Crawler đệ quy DFS, phát hiện menu, click nút
│   │   └── message-parser.service.ts# Trích xuất text, inline buttons & signature
│   │
│   ├── products/
│   │   ├── product.types.ts         # Khai báo kiểu Product, StockStatus, Zod schema
│   │   ├── warranty-parser.service.ts # Parse mã bảo hành FW, NW, W*
│   │   ├── duration-parser.service.ts # Parse thời hạn gói 1M, 24M, 1Y,...
│   │   ├── price-parser.service.ts    # Parse đơn giá VND
│   │   ├── stock-parser.service.ts    # Parse số lượng tồn kho & trạng thái
│   │   ├── product-id.generator.ts    # Sinh stable hash SHA-256
│   │   ├── product-parser.service.ts  # Parser tổng hợp đa tầng
│   │   ├── product-normalizer.service.ts # Validate dữ liệu qua Zod
│   │   └── parsers.test.ts          # Unit test toàn diện cho các parser
│   │
│   ├── google/
│   │   ├── google-auth.service.ts   # Xác thực Service Account JWT
│   │   └── google-sheets.service.ts # Thao tác CRUD, batch update, sheets logging
│   │
│   ├── scheduler/
│   │   └── sync.scheduler.ts        # Cron job 1h/lần với múi giờ Asia/Ho_Chi_Minh
│   │
│   ├── services/
│   │   └── sync.service.ts          # Logic đồng bộ trung tâm & lock an toàn
│   │
│   ├── utils/
│   │   ├── delay.ts                 # Sleep, randomDelay, bắt FLOOD_WAIT
│   │   ├── retry.ts                 # Exponential backoff retry 3 lần
│   │   ├── date.ts                  # Format thời gian theo múi giờ Việt Nam
│   │   └── logger.ts                # Pino logger hiển thị màu sắc trực quan
│   │
│   ├── scripts/
│   │   ├── telegram-login.ts        # CLI: npm run telegram:login
│   │   └── sync-now.ts              # CLI: npm run sync (chạy ngay lập tức)
│   │
│   └── index.ts                     # Entrypoint chạy nền dài hạn & graceful shutdown
│
├── ecosystem.config.cjs             # Cấu hình triển khai PM2 trên VPS Ubuntu
├── package.json
├── tsconfig.json
├── eslint.config.js
└── .env.example
```

---

## 🛠️ Hướng Dẫn Cài Đặt & Cấu Hình Chi Tiết (A - Z)

### 1. Lấy API ID & API Hash từ Telegram

1. Truy cập trang web chính thức của Telegram: [https://my.telegram.org](https://my.telegram.org)
2. Nhập số điện thoại Telegram của bạn và mã xác nhận gửi về app Telegram.
3. Chọn mục **API development tools**.
4. Điền `App title` và `Short name` bất kỳ (ví dụ: `ProductCrawler`).
5. Bạn sẽ nhận được 2 thông số:
   - **`api_id`** (dãy số, ví dụ: `12345678`)
   - **`api_hash`** (chuỗi ký tự, ví dụ: `a1b2c3d4e5f6...`)
6. Copy 2 thông số này vào file `.env`.

---

### 2. Cấu Hình Google Sheets & Google Cloud Service Account

#### Bước 2.1: Tạo Google Cloud Project & Bật Google Sheets API
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo mới một Project (hoặc chọn Project có sẵn).
3. Tìm kiếm **Google Sheets API** trong thanh tìm kiếm trên cùng và nhấn **Enable** (Bật).

#### Bước 2.2: Tạo Service Account
1. Vào mục **IAM & Admin** -> **Service Accounts**.
2. Nhấn **Create Service Account**, đặt tên (ví dụ: `sheets-crawler-bot`) -> Nhấn **Create and Continue** -> Nhấn **Done**.
3. Bấm vào Service Account vừa tạo, chuyển sang tab **Keys**.
4. Nhấn **Add Key** -> **Create new key** -> Chọn **JSON** -> Nhấn **Create**.
5. Một file `.json` sẽ tự động tải về máy tính của bạn.
6. Mở file `.json` vừa tải, bạn sẽ thấy 2 trường quan trọng:
   - `client_email`: Điền vào `GOOGLE_SERVICE_ACCOUNT_EMAIL` trong `.env`.
   - `private_key`: Điền vào `GOOGLE_PRIVATE_KEY` trong `.env` (giữ nguyên cặp dấu ngoặc kép và các ký tự `\n`).

#### Bước 2.3: Tạo & Phân Quyền Cho Google Sheet
1. Mở [Google Sheets](https://sheets.new) tạo một bảng tính mới.
2. Đổi tên Sheet hoặc giữ nguyên mặc định.
3. Lấy **Spreadsheet ID** từ thanh địa chỉ trình duyệt:
   ```
   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
   ```
   Điền ID này vào `GOOGLE_SPREADSHEET_ID` trong `.env`.
4. Nhấn nút **Share (Chia sẻ)** ở góc phải trên cùng của Google Sheet:
   - Dán địa chỉ email Service Account (dạng `...gserviceaccount.com`).
   - Cấp quyền: **Editor (Người chỉnh sửa)**.
   - Nhấn **Send (Gửi)**.
   *(Hệ thống sẽ tự động khởi tạo 3 sheet: `Products`, `PriceHistory`, `SyncLogs` với các header tiêu chuẩn ngay trong lần chạy đầu tiên)*.

---

### 3. Thiết Lập Biến Môi Trường (.env)

Tạo file `.env` từ file mẫu:

```bash
cp .env.example .env
```

Mở `.env` và điền các thông tin:

```env
NODE_ENV=development

# Telegram MTProto Credentials
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_telegram_api_hash_here
TELEGRAM_BOT_USERNAME=@username_cua_bot_can_crawl

# Google Sheets Configuration
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Products

# Google Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=crawler-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Scheduler (chạy đầu mỗi giờ)
SYNC_CRON=0 * * * *
SYNC_ON_START=true

# Timezone
TZ=Asia/Ho_Chi_Minh

# Delays an toàn (ms)
TELEGRAM_MIN_DELAY=1200
TELEGRAM_MAX_DELAY=2500
TELEGRAM_RESPONSE_TIMEOUT=15000
```

---

### 4. Đăng Nhập Telegram Lần Đầu (Chỉ Cần Làm 1 Lần)

Chạy lệnh đăng nhập tương tác:

```bash
npm run telegram:login
```

Hệ thống cung cấp **2 lựa chọn đăng nhập cực kỳ tiện lợi**:
1. **Quét mã QR**: Terminal sẽ in ra mã QR. Bạn chỉ cần mở app Telegram trên điện thoại: **Cài đặt (Settings) -> Thiết bị (Devices) -> Quét mã QR (Link Desktop Device)** là đăng nhập xong tức thì!
2. **Số điện thoại + OTP**: Nhập số điện thoại quốc tế (ví dụ: `+84912345678`), nhập mã OTP nhận được trên Telegram và mật khẩu 2FA (nếu có).

Sau khi đăng nhập thành công, chuỗi phiên `TELEGRAM_SESSION` sẽ được **tự động lưu vào file `.env`**. Bạn không bao giờ cần phải nhập lại mã OTP nữa!

---

## 🚀 Hướng Dẫn Sử Dụng

### 1. Kiểm tra chạy thử ngay lập tức (Manual Sync)
Để cào dữ liệu bot và đồng bộ lên Google Sheets ngay lập tức 1 lần:

```bash
npm run sync
```

### 2. Chạy môi trường phát triển (Development Mode)
Khởi động crawler với cơ chế lập lịch tự động mỗi 1 giờ:

```bash
npm run dev
```

### 3. Build mã nguồn TypeScript sang JavaScript
```bash
npm run build
```

### 4. Chạy môi trường Production cục bộ
```bash
npm run start
```

### 5. Chạy kiểm thử tự động (Unit Tests)
Kiểm tra tính chính xác của toàn bộ parser và ID generator:

```bash
npm run test
```

---

## 🌐 Triển Khai Lên Ubuntu VPS Bằng PM2

Để ứng dụng chạy ổn định 24/7 dưới nền và tự khởi động lại khi server reboot:

1. **Cài đặt PM2 trên VPS** (nếu chưa có):
   ```bash
   npm install -g pm2
   ```

2. **Cài đặt dependencies & build dự án**:
   ```bash
   npm install
   npm run build
   ```

3. **Khởi chạy ứng dụng qua file cấu hình `ecosystem.config.cjs`**:
   ```bash
   pm2 start ecosystem.config.cjs
   ```

4. **Lưu cấu hình và bật tự khởi động cùng hệ thống**:
   ```bash
   pm2 save
   pm2 startup
   ```

5. **Theo dõi log và trạng thái**:
   ```bash
   pm2 status
   pm2 logs telegram-crawler-sheets
   ```

---

## 📊 Cấu Trúc Các Bảng Trên Google Sheets

### Bảng 1: `Products`
| Cột | Tiêu đề | Mô tả |
|:---|:---|:---|
| **A** | ID | 16 ký tự SHA-256 duy nhất định danh sản phẩm |
| **B** | Danh mục | Tên danh mục cấp 1 (ví dụ: ChatGPT, Canva, Netflix) |
| **C** | Danh mục con | Tên gói/danh mục con nếu có (ví dụ: GPT Plus / Ready Account) |
| **D** | Tên dịch vụ | Tên dịch vụ đã làm sạch (ví dụ: GPT TEAM) |
| **E** | Phiên bản/Gói | Gói phụ (ví dụ: business, ready acc, slot, family) |
| **F** | Thời hạn | Thời hạn gói (ví dụ: 1 tháng, 24 tháng, 1 năm) |
| **G** | Mã bảo hành | Mã gốc (ví dụ: FW, NW, W2D, W5H, W4M) |
| **H** | Bảo hành | Giải nghĩa tiếng Việt (ví dụ: Bảo hành 2 ngày, Bảo hành đầy đủ) |
| **I** | Giá nhập | Đơn vị VND dạng số nguyên (ví dụ: 395000) |
| **J** | Tồn kho | Số lượng còn lại dạng số (ví dụ: 308) hoặc 0 nếu hết hàng |
| **K** | Trạng thái | `IN_STOCK`, `OUT_OF_STOCK`, hoặc `UNKNOWN` |
| **L** | Active | `TRUE` (đang bán) / `FALSE` (bot đã ngừng hiển thị) |
| **M** | Nguồn | Username bot Telegram nguồn |
| **N** | Nội dung gốc | Chuỗi gốc chưa parse từ Telegram |
| **O** | Lần đầu phát hiện | Thời gian phát hiện lần đầu (giờ VN) |
| **P** | Cập nhật gần nhất | Thời gian cập nhật trạng thái/giá mới nhất (giờ VN) |

### Bảng 2: `PriceHistory`
Ghi lại biến động mỗi khi giá sản phẩm thay đổi giữa 2 lần quét:
- **Product ID**: ID sản phẩm
- **Tên dịch vụ**: Tên gói
- **Danh mục**: Danh mục
- **Giá cũ**: Đơn giá trước đó
- **Giá mới**: Đơn giá mới
- **Chênh lệch**: Mức tăng giảm (+15000, -20000,...)
- **Thời gian thay đổi**: Thời điểm phát hiện biến động giá

### Bảng 3: `SyncLogs`
Lưu vết từng lần chạy tự động:
- **Sync ID**: Mã phiên chạy (ví dụ: `sync_1728345600000`)
- **Bắt đầu**: Thời điểm bắt đầu
- **Kết thúc**: Thời điểm hoàn thành
- **Thời gian chạy**: Thời gian thực thi (giây)
- **Danh mục**: Số danh mục đã duyệt
- **Tổng SP tìm thấy**: Tổng số sản phẩm quét được
- **SP thêm mới**: Số sản phẩm mới xuất hiện
- **SP cập nhật**: Số sản phẩm được cập nhật giá/tồn kho
- **Thay đổi giá**: Số lượng sản phẩm có biến động giá
- **Số lỗi**: Số lỗi phát sinh trong quá trình duyệt
- **Trạng thái**: `SUCCESS`, `SUCCESS_WITH_ERRORS`, hoặc `FAILED`
