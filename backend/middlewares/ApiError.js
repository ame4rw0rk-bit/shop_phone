class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.expose = status < 500;
    if (details) this.details = details;
  }

  static badRequest(message = 'طلب غير صالح', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'يجب تسجيل الدخول أولاً') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'لا تملك صلاحية لهذا الإجراء') {
    return new ApiError(403, message);
  }

  static notFound(message = 'العنصر غير موجود') {
    return new ApiError(404, message);
  }

  static conflict(message = 'البيانات مستخدمة بالفعل') {
    return new ApiError(409, message);
  }
}

module.exports = ApiError;
