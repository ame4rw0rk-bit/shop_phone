const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');

const config = require('./config/env');
const { syncModels, sequelize } = require('./models');
const sanitizeInput = require('./middlewares/sanitizeMiddleware');
const { apiLimiter } = require('./middlewares/rateLimiters');
const { errorHandler, notFoundHandler, jsonBodyOverflowHandler } = require('./middlewares/errorHandler');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/productRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const metaRoutes = require('./routes/metaRoutes');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const app = express();

app.disable('x-powered-by');
// فعّلها فقط عند وجود Reverse Proxy موثوق (nginx/cloud) وإلا يُزيَّف عنوان IP
app.set('trust proxy', config.trustProxy ? 1 : false);
app.set('etag', 'strong');

/* ------------------------------ 1. الحماية ------------------------------ */
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      // كل السكربتات ملفات خارجية: لا 'unsafe-inline' ولا 'unsafe-eval'
      scriptSrc: ["'self'"],
      // 'unsafe-inline' للأنماط فقط (تُستخدم لإخفاء/إظهار الأقسام)
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: config.isProduction ? [] : null
    }
  },
  referrerPolicy: { policy: 'same-origin' },
  hsts: config.isProduction
    ? { maxAge: 15_552_000, includeSubDomains: true, preload: true }
    : false,
  crossOriginEmbedderPolicy: false
}));

app.use(hpp());

const corsOptions = () => ({
  origin: (origin, callback) => {
    // نفس المصدر (بدون Origin) مسموح دائماً
    if (!origin) return callback(null, true);
    if (config.cors.origins.includes(origin)) return callback(null, true);
    if (config.cors.allowAnyOrigin) return callback(null, true);
    return callback(null, false);
  },
  // الجلسات تُحمَل في ترويسة Authorization، لا حاجة للكوكيز
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
});

/* --------------------------- 2. تحليل الجسم ---------------------------- */
app.use('/api/', express.json({ limit: config.bodyLimit, strict: true }));
app.use('/api/', express.urlencoded({ extended: false, limit: config.bodyLimit }));
app.use('/api/', sanitizeInput);
app.use('/api', cors(corsOptions()));
app.use('/api/', apiLimiter);

/* ------------------------------ 3. المسارات ----------------------------- */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/config', metaRoutes);

// أي مسار /api آخر: رد JSON 404 فقط، بلا كشف عن ملفات الواجهة
app.use('/api', notFoundHandler);

/* ------------------------- 4. الملفات الساكنة --------------------------- */
// صور المنتجات المرفوعة
app.use('/uploads', express.static(UPLOADS_DIR, {
  dotfiles: 'ignore',
  etag: true,
  maxAge: config.isProduction ? '7d' : 0,
  setHeaders(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }
}));

// ملفات الواجهة
app.use(express.static(FRONTEND_DIR, {
  dotfiles: 'ignore',
  etag: true,
  index: ['index.html'],
  maxAge: config.isProduction ? '1h' : 0,
  setHeaders(res, filePath) {
    if (/\.(html)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (/\.(js|css|woff2?|jpg|jpeg|png|svg|webp)$/i.test(filePath)) {
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
  }
}));

// توجيه أي رابط غير ملف/واجهة حقيقي إلى الرئيسية (دعم الروابط الداخلية)
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'), (err) => {
    if (err) next(err);
  });
});

/* ------------------------------ 5. الأخطاء ------------------------------ */
app.use(jsonBodyOverflowHandler);
app.use(errorHandler);

/* ---------------------------- 6. الإقلاع ------------------------------- */
let server;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ الاتصال بقاعدة البيانات يعمل.');

    if (config.db.syncOnBoot) {
      // sync() فقط: ينشئ الجداول الناقصة ولا يعبث بالمؤشرات الموجودة
      await syncModels();
      console.log('✅ الجداول جاهزة.');
    }

    server = app.listen(config.port, () => {
      console.log(`🚀 ${config.public.storeName} يعمل على http://localhost:${config.port} (${config.nodeEnv})`);
    });
    server.headersTimeout = 65_000;
    server.requestTimeout = 30_000;
  } catch (error) {
    console.error('❌ فشل التشغيل:', error.message);
    await sequelize.close().catch(() => {});
    process.exit(1);
  }
}

function shutdown(signal) {
  console.log(`\n${signal} — إيقاف آمن للسيرفر...`);
  if (!server) process.exit(0);
  server.close(async () => {
    await sequelize.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

if (require.main === module) start();

module.exports = app;
