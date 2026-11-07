const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Debug: Check which Railway env vars are present (without revealing values)
const REQUIRED_VARS = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SECRET', 'RECOVERY_JWT_SECRET'];
const missingVars = REQUIRED_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error('❌ Railway environment variables missing:', missingVars.join(', '));
  console.error('⚠️  Make sure all variables are set in Railway dashboard and redeploy.');
} else {
  console.log('✅ All required Railway environment variables are present');
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

function toInt(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`الإعداد ${name} غير صالح: "${value}" — يجب رقم موجب.`);
  }
  return Math.trunc(parsed);
}

function readSecret(name, minBytes) {
  const value = (process.env[name] || '').trim();
  if (value.length >= minBytes) return value;
  if (isProduction) {
    throw new Error(
      `${name} مطلوب في بيئة الإنتاج ويجب ألا يقل عن ${minBytes} حرفاً. ` +
      'أنشئه بالأمر: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  const temporary = crypto.randomBytes(48).toString('hex');
  console.warn(
    `⚠️  ${name} غير مضبوط في .env — تم توليد سر مؤقت لهذه الجلسة فقط.\n` +
    `    كل إعادة تشغيل للسيرفر ستُلغي الجلسات الحالية. أضِفه إلى backend/.env`
  );
  return temporary;
}

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

// يمنع تسرّب قيم القوالب (.env.example) إلى الواجهة فتُفتح روابط تليجرام مكسورة
function cleanHandle(raw) {
  const value = (raw || '').trim().replace(/^@/, '');
  if (!value) return '';
  if (/your|example|placeholder|changeme|تغيير|حساب_/i.test(value)) return '';
  return value;
}

const config = {
  isProduction,
  nodeEnv: NODE_ENV,
  port: toInt(process.env.PORT, 5000, 'PORT'),
  trustProxy: process.env.TRUST_PROXY === 'true',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306, 'DB_PORT'),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    pass: process.env.DB_PASS ?? '',
    ssl: process.env.DB_SSL === 'true',
    syncOnBoot: process.env.DB_SYNC !== 'false',
    pool: {
      max: toInt(process.env.DB_POOL_MAX, 10, 'DB_POOL_MAX'),
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  jwt: {
    secret: readSecret('JWT_SECRET', 32),
    recoverySecret: readSecret('RECOVERY_JWT_SECRET', 32),
    expiresIn: process.env.TOKEN_EXPIRES_IN || '1d',
    recoveryExpiresIn: process.env.RECOVERY_TOKEN_EXPIRES_IN || '10m'
  },

  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12, 'BCRYPT_ROUNDS'),

  cors: {
    origins: corsOrigins,
    allowAnyOrigin: !isProduction && corsOrigins.length === 0
  },

  rateLimit: {
    apiWindowMs: toInt(process.env.RATE_LIMIT_API_WINDOW_MIN, 15, 'RATE_LIMIT_API_WINDOW_MIN') * 60_000,
    apiMax: toInt(process.env.RATE_LIMIT_API_MAX, 300, 'RATE_LIMIT_API_MAX'),
    authWindowMs: toInt(process.env.RATE_LIMIT_AUTH_WINDOW_MIN, 15, 'RATE_LIMIT_AUTH_WINDOW_MIN') * 60_000,
    authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 10, 'RATE_LIMIT_AUTH_MAX'),
    loginWindowMs: toInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MIN, 15, 'RATE_LIMIT_LOGIN_WINDOW_MIN') * 60_000,
    loginMax: toInt(process.env.RATE_LIMIT_LOGIN_MAX, 8, 'RATE_LIMIT_LOGIN_MAX')
  },

  bodyLimit: process.env.BODY_LIMIT || '32kb',

  // قيم قابلة للنشر بدون إعادة بناء الواجهة
  public: {
    telegramUsername: cleanHandle(process.env.TELEGRAM_USERNAME),
    storeName: process.env.STORE_NAME || 'TechGadget',
    supportEmail: process.env.SUPPORT_EMAIL || ''
  },

  seed: {
    name: process.env.SEED_ADMIN_NAME || '',
    username: process.env.SEED_ADMIN_USERNAME || '',
    passKey: process.env.SEED_ADMIN_PASS_KEY || '',
    recoveryCode: process.env.SEED_ADMIN_RECOVERY_CODE || ''
  }
};

if (!config.db.name || !config.db.user) {
  throw new Error('إعدادات قاعدة البيانات ناقصة: DB_NAME و DB_USER إلزاميان في .env');
}

if (config.isProduction && (config.seed.passKey.length === 16 || config.seed.recoveryCode)) {
  console.warn('⚠️  SEED_ADMIN_* تُستخدم فقط لإنشاء حساب الأدمن الأول؛ احذفها من .env بعد التهيئة.');
}

module.exports = config;
