const { ValidationError, UniqueConstraintError } = require('sequelize');
const config = require('../config/env');
const ApiError = require('./ApiError');

// يعمل على مستوى التطبيق أو داخل راوتر مُثبَّت على /api
const isApiPath = (req) => (req.baseUrl || '').startsWith('/api') || (req.path || '').startsWith('/api/');

function notFoundHandler(req, res, next) {
  if (!isApiPath(req)) return next();
  res.status(404).json({ status: 'error', message: 'المسار غير موجود' });
}

function jsonBodyOverflowHandler(err, req, res, next) {
  if (!err) return next();
  const isBodyLimit = err.type === 'entity.too.large' || err.status === 413;
  if (!isBodyLimit) return next(err);
  if (!isApiPath(req)) return next(err);
  res.status(413).json({ status: 'error', message: 'حجم البيانات المرسلة أكبر من الحد المسموح' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'خطأ داخلي في الخادم';

  if (err instanceof UniqueConstraintError) {
    status = 409;
    message = 'هذه البيانات مسجّلة مسبقاً، تحقّق من اسم المستخدم أو أعد المحاولة.';
  } else if (err instanceof ValidationError) {
    status = 400;
    message = 'بعض المدخلات غير صيغة أو غير صالحة.';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'الجلسة غير صالحة أو منتهية، سجّل الدخول من جديد.';
  }

  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl, err.stack || err.message);
    if (config.isProduction) message = 'حدث خطأ غير متوقع في الخادم.';
  }

  if (res.headersSent || !isApiPath(req)) return next(err);

  res.status(status).json({
    status: 'error',
    message,
    ...(status === 400 && err.errors ? {
      details: err.errors.map((e) => ({ field: e.path, message: e.message }))
    } : {})
  });
}

module.exports = { errorHandler, notFoundHandler, jsonBodyOverflowHandler, ApiError };
