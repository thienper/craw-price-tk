import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Saves or updates TELEGRAM_SESSION in the local .env file.
 */
function saveSessionToEnv(sessionString: string): void {
  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const sessionRegex = /^TELEGRAM_SESSION=.*$/m;
  if (sessionRegex.test(envContent)) {
    envContent = envContent.replace(sessionRegex, `TELEGRAM_SESSION=${sessionString}`);
  } else {
    envContent = envContent.trim() + `\nTELEGRAM_SESSION=${sessionString}\n`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  logger.info('[Auth] TELEGRAM_SESSION has been saved successfully to .env!');
}

/**
 * Interactive login helper allowing either QR code scanning or Phone + OTP + 2FA.
 */
export async function runInteractiveLogin(): Promise<void> {
  const apiId = env.TELEGRAM_API_ID;
  const apiHash = env.TELEGRAM_API_HASH;

  if (!apiId || !apiHash) {
    logger.error('Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env.');
    logger.info('Please visit https://my.telegram.org -> API development tools to get your API ID & Hash, then fill them in .env');
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });

  console.info('\n======================================================');
  console.info('       TELEGRAM MTPROTO AUTHENTICATION SETUP          ');
  console.info('======================================================');
  console.info('1. Đăng nhập bằng Quét mã QR (Nhanh nhất: mở app Telegram -> Settings -> Devices -> Link Desktop Device)');
  console.info('2. Đăng nhập bằng Số điện thoại + OTP + 2FA');
  console.info('======================================================\n');

  const choice = (await rl.question('Chọn phương thức (1 hoặc 2) [Mặc định: 1]: ')).trim() || '1';

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  if (choice === '1') {
    console.info('\n[QR Code Login] Đang khởi tạo mã QR...');
    try {
      await client.signInUserWithQrCode(
        { apiId, apiHash },
        {
          qrCode: async (code) => {
            console.info('\n--- QUÉT MÃ QR DƯỚI ĐÂY BẰNG APP TELEGRAM TRÊN ĐIỆN THOẠI ---');
            console.info('(Settings -> Devices -> Link Desktop Device -> Scan QR Code)\n');
            qrcode.generate(`tg://login?token=${code.token.toString('base64url')}`, { small: true });
          },
          password: async (hint) => {
            return await rl.question(`Nhập mật khẩu 2FA (Hint: ${hint || 'không có'}): `);
          },
          onError: async (err) => {
            logger.error(`[QR Login Error] ${(err as Error).message}`);
            return false;
          },
        },
      );
    } catch (err) {
      logger.warn(`QR Login failed: ${(err as Error).message}. Chuyển sang đăng nhập bằng SĐT...`);
      await loginWithPhone(client, rl);
    }
  } else {
    await loginWithPhone(client, rl);
  }

  rl.close();

  const savedSession = client.session.save() as unknown as string;
  saveSessionToEnv(savedSession);

  console.info('\n======================================================');
  console.info('       ĐĂNG NHẬP THÀNH CÔNG!                          ');
  console.info(' Session đã được lưu an toàn vào .env.               ');
  console.info(' Giờ bạn có thể chạy: `npm run sync` hoặc `npm run dev`');
  console.info('======================================================\n');

  await client.disconnect();
}

/**
 * Standard Phone + Code + 2FA login.
 */
async function loginWithPhone(client: TelegramClient, rl: readline.Interface): Promise<void> {
  await client.start({
    phoneNumber: async () => await rl.question('Nhập số điện thoại (ví dụ: +84912345678): '),
    password: async () => await rl.question('Nhập mật khẩu 2FA (nếu có, để trống nếu không có): '),
    phoneCode: async () => await rl.question('Nhập mã OTP Telegram vừa gửi: '),
    onError: (err) => logger.error(`[Auth Error] ${err.message}`),
  });
}
