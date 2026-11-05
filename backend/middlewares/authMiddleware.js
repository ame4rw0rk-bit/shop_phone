const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('./ApiError');

const ADMIN_ROLE = 'ameer_OxAmeer_admin';

function signToken(user, { secret = config.jwt.secret, expiresIn = config.jwt.expiresIn } = {}) {
  // لا نضع أي بيانات حساسة داخل التوكن غير المعرّف والدور
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, secret, {
    algorithm: 'HS256',
    expiresIn
  });
}

function readBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token.trim();
}

function verifyToken(req, res, next) {
  const token = readBearer(req);

  if (!token) {
    return next(new ApiError(401, 'يجب تسجيل الدخول للوصول إلى هذا المورد'));
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
    if (!decoded.sub) throw new ApiError(401, 'الجلسة غير صالحة');
    req.user = { id: decoded.sub, username: decoded.username, role: decoded.role };
    return next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return next(new ApiError(401, expired
      ? 'انتهت صلاحية الجلسة، سجّل الدخول من جديد'
      : 'الجلسة غير صالحة، سجّل الدخول من جديد'));
  }
}

function isAdmin(req, res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== ADMIN_ROLE) return next(ApiError.forbidden('هذه الصفحة مخصّصة للإدارة فقط'));
  return next();
}

module.exports = { verifyToken, isAdmin, signToken, readBearer, ADMIN_ROLE };
