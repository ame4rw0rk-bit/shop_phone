const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const ApiError = require('./ApiError');

// أنواع الصور المسموحة
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp'
];

// الحد الأقصى للحجم: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// مسار مجلد الـ uploads
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// إنشاء المجلد تلقائياً إذا ما موجود
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// إعدادات التخزين
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // اسم فريد لكل صورة
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// فلتر أنواع الملفات
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `نوع الملف غير مسموح. الأنواع المسموحة: JPG, PNG, WebP, GIF, BMP`), false);
  }
};

// إعداد multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  }
});

// middleware للرفع مع معالجة الأخطاء
function handleUpload(req, res, next) {
  const uploader = upload.single('image');
  
  uploader(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('حجم الصورة يتجاوز 5MB. اختر صورة أصغر.'));
      }
      return next(ApiError.badRequest(`خطأ في رفع الملف: ${err.message}`));
    }
    if (err) {
      return next(err);
    }
    next();
  });
}

module.exports = { handleUpload, ALLOWED_MIME_TYPES, MAX_FILE_SIZE };
