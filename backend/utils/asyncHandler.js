// Express 4 لا ينتظر الـ Promise: أي reject من معالج async يسقط كـ
// unhandledRejection ويوقف العملية. هذا المغلف يعيد الخطأ إلى سلسلة الوسائط.
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncHandler;
