const rateLimit = require('express-rate-limit');
const config = require('../config/env');

function makeLimiter({ windowMs, limit, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (req, res) => {
      res.status(429).json({
        status: 'error',
        message,
        retryAfterSeconds: Math.ceil(windowMs / 1000)
      });
    }
  });
}

const apiLimiter = makeLimiter({
  windowMs: config.rateLimit.apiWindowMs,
  limit: config.rateLimit.apiMax,
  message: 'عدد الطلبات كبير جداً من عنوانك، حاول بعد قليل.'
});

const authLimiter = makeLimiter({
  windowMs: config.rateLimit.authWindowMs,
  limit: config.rateLimit.authMax,
  message: 'محاولات إنشاء/استرجاع كثيرة جداً، انتظر قليلاً ثم حاول.'
});

// لا يُحسب على attempts الناجحة حتى لا يُغلق الباب على المستخدم الحقيقي
const loginLimiter = makeLimiter({
  windowMs: config.rateLimit.loginWindowMs,
  limit: config.rateLimit.loginMax,
  message: 'محاولات دخول كثيرة فاشلة. انتظر قليلاً ثم حاول مجدداً.',
  skipSuccessfulRequests: true
});

module.exports = { apiLimiter, authLimiter, loginLimiter };
