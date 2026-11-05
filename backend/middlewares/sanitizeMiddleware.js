const MAX_STRING_LENGTH = 5000;

// إزالة أحرف التحكّم فقط. التطهير الحقيقي ضد XSS يحدث عند العرض
// (textContent في الواجهة) وعند التحقق من صحة المدخلات حسب الحقل.
function cleanString(value) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function sanitizeValue(value, depth = 0) {
  if (depth > 6) return value;

  if (typeof value === 'string') {
    const cleaned = cleanString(value);
    return cleaned.length > MAX_STRING_LENGTH ? cleaned.slice(0, MAX_STRING_LENGTH) : cleaned;
  }

  if (Array.isArray(value)) {
    // منع هجمات النوع {limit: {__op}} على مسارات Sequelize
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        delete value[key];
        continue;
      }
      value[key] = sanitizeValue(value[key], depth + 1);
    }
  }

  return value;
}

// تعديل الكائنات الموجودة في مكانها: Express 4 يحمي req.query من الإسناد
function sanitizeInPlace(target) {
  if (!target || typeof target !== 'object') return;
  for (const key of Object.keys(target)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete target[key];
      continue;
    }
    target[key] = sanitizeValue(target[key]);
  }
}

function sanitizeInput(req, res, next) {
  sanitizeInPlace(req.body);
  sanitizeInPlace(req.query);
  sanitizeInPlace(req.params);
  next();
}

module.exports = sanitizeInput;
