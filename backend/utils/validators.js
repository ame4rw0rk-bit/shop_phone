const ApiError = require('../middlewares/ApiError');

const USERNAME_RE = /^[a-z0-9_.]{4,15}$/;
// 16 حرفاً بالضبط مع حرف واحد ورقم واحد على الأقل
const PASS_KEY_RE = /^(?=.*[A-Za-z])(?=.*\d).{16}$/;
const URL_RE = /^https?:\/\/[^\s"'<>\\]{4,500}$/i;

// الأرقام boolean تُقبل لأن الواجهة ترسل JSON وليست نصاً فقط
function str(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return '';
}

function requireString(body, field, { label, min = 1, max = 500, pattern, patternError } = {}) {
  const value = str(body[field]);
  if (!value) throw ApiError.badRequest(`${label} مطلوب`);
  if (value.length < min || value.length > max) {
    throw ApiError.badRequest(`${label} يجب أن يكون بين ${min} و ${max} حرفاً`);
  }
  if (pattern && !pattern.test(value)) {
    throw ApiError.badRequest(patternError || `${label} غير صالح`);
  }
  return value;
}

function optionalString(body, field, { max = 500, allowEmpty = true } = {}) {
  if (body[field] === undefined || body[field] === null) return allowEmpty ? '' : undefined;
  const value = str(body[field]);
  if (value.length > max) throw ApiError.badRequest('أحد الحقول النصية أطول من الحد المسموح');
  return value;
}

function parsePrice(value) {
  const raw = typeof value === 'string' ? value.replace(/[,_\s]/g, '') : value;
  const price = Number(raw);
  // الأسعار بالدينار العراقي ممكن توصل لملايين (مثلاً 50,000,000)
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) {
    throw ApiError.badRequest('السعر يجب أن يكون رقماً موجباً');
  }
  return Math.round(price);
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = str(value).toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw ApiError.badRequest('قيمة التوفر يجب أن تكون صحيحة أو خاطئة');
}

function parseId(value, label = 'المعرّف') {
  const id = str(value);
  if (!/^\d{1,10}$/.test(id)) throw ApiError.badRequest(`${label} غير صالح`);
  return Number(id);
}

function parseImageUrl(value) {
  const url = str(value);
  if (!url) return null;
  
  // السماح بروابط الصور المحلية المرفوعة
  if (url.startsWith('/uploads/')) {
    // تحقق أن الاسم آمن
    const filename = url.replace('/uploads/', '');
    if (!/^[a-f0-9]+\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(filename)) {
      throw ApiError.badRequest('اسم الملف غير صالح');
    }
    return url;
  }
  
  // السماح بالروابط الخارجية
  if (!URL_RE.test(url)) throw ApiError.badRequest('رابط الصورة يجب أن يبدأ بـ http://或 https:// أو يكون من الصور المرفوعة');

  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    throw ApiError.badRequest('رابط الصورة غير صالح');
  }

  // حجب الروابط/الشبكات الداخلية لمنع SSRF عبر وسوم img
  const isInternal = host === 'localhost'
    || host === '::1'
    || host === '0.0.0.0'
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (isInternal) throw ApiError.badRequest('لا يمكن استخدام روابط داخلية للصور');
  return url;
}

module.exports = {
  USERNAME_RE,
  PASS_KEY_RE,
  str,
  requireString,
  optionalString,
  parsePrice,
  parseBoolean,
  parseId,
  parseImageUrl
};
