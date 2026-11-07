const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, RecoveryCode } = require('../models');
const config = require('../config/env');
const ApiError = require('../middlewares/ApiError');
const { signToken } = require('../middlewares/authMiddleware');
const { USERNAME_RE, PASS_KEY_RE, requireString, str } = require('../utils/validators');

// مقارنة وهمية بنفس التكلفة لتفادي تسريب أي اسم مستخدم موجود عبر فرق الزمن
const DUMMY_HASH = bcrypt.hashSync('placeholder-pass-key-16', config.bcryptRounds);

function validateUsername(username) {
  return requireString({ username }, 'username', {
    label: 'اسم المستخدم',
    min: 4,
    max: 15,
    pattern: USERNAME_RE,
    patternError: 'اسم المستخدم يجب أن يكون 4-15 حرفاً: أحرف إنجليزية صغيرة وأرقام و _ و . فقط'
  });
}

function validatePassKey(pass_key, label = 'مفتاح المرور') {
  const value = typeof pass_key === 'string' ? pass_key : '';
  if (value.length !== 16) {
    throw ApiError.badRequest(`${label} يجب أن يتكوّن من 16 حرفاً/رمزاً بالضبط`);
  }
  if (!PASS_KEY_RE.test(value)) {
    throw ApiError.badRequest(`${label} يجب أن يحتوي على حرف واحد ورقم واحد على الأقل`);
  }
  return value;
}

function validateName(name) {
  return requireString({ name }, 'name', {
    label: 'الاسم الكامل',
    min: 2,
    max: 25,
    pattern: /^[a-zA-Z\u0600-\u06FF .'-]{2,25}$/,
    patternError: 'الاسم يجب أن يكون 2-25 حرفاً بدون رموز خاصة'
  });
}

function validateRecoveryCode(code) {
  return requireString({ code }, 'code', {
    label: 'كود الاسترجاع',
    min: 8,
    max: 20,
    pattern: /^\S+$/, // بدون فراغات
    patternError: 'كود الاسترجاع يجب ألا يحتوي على فراغات'
  });
}

exports.register = async (req, res) => {
  const name = validateName(req.body.name);
  const username = validateUsername(req.body.username).toLowerCase();
  const pass_key = validatePassKey(req.body.pass_key);
  const recoveryCode = validateRecoveryCode(req.body.Recovery_code);

  if (recoveryCode === pass_key) {
    throw ApiError.badRequest('كود الاسترجاع يجب أن يختلف عن مفتاح المرور');
  }

  const existing = await User.findOne({ where: { username }, attributes: ['id'] });
  if (existing) throw ApiError.conflict('اسم المستخدم مستخدم بالفعل، اختر غيره.');

  const [hash, recoveryHash] = await Promise.all([
    bcrypt.hash(pass_key, config.bcryptRounds),
    bcrypt.hash(recoveryCode, config.bcryptRounds)
  ]);

  const transaction = await RecoveryCode.sequelize.transaction();
  try {
    const user = await User.create(
      { name, username, pass_key: hash, role: 'user' },
      { transaction }
    );
    await RecoveryCode.create({ username, Recovery_code: recoveryHash }, { transaction });
    await transaction.commit();

    const token = signToken(user);
    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      user: user.toSafeJSON(),
      token
    });
  } catch (err) {
    await transaction.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw ApiError.conflict('اسم المستخدم مستخدم بالفعل، اختر غيره.');
    }
    throw err;
  }
};

exports.login = async (req, res) => {
  const username = validateUsername(str(req.body.username)).toLowerCase();
  // المفتاح لا يُقصّ ولا يُحوَّل: كلمات السر حسّاسة لحالة الأحرف
  const pass_key = typeof req.body.pass_key === 'string' ? req.body.pass_key : '';

  if (!pass_key) throw ApiError.badRequest('اسم المستخدم ومفتاح المرور مطلوبان');

  const user = await User.scope('withSecret').findOne({ where: { username } });

  const isMatch = await bcrypt.compare(pass_key, user ? user.pass_key : DUMMY_HASH);

  // رسالة موحّدة حتى لا نكشف هل الاسم موجود أم لا
  if (!user || !isMatch) throw ApiError.badRequest('اسم المستخدم أو مفتاح المرور غير صحيح');

  const token = signToken(user);
  res.json({ message: 'تم تسجيل الدخول بنجاح', user: user.toSafeJSON(), token });
};

exports.me = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) throw ApiError.unauthorized('الحساب لم يعد موجوداً');
  res.json({ user: user.toSafeJSON() });
};

exports.verifyRecoveryCode = async (req, res) => {
  const username = validateUsername(str(req.body.username)).toLowerCase();
  const recoveryCode = validateRecoveryCode(req.body.Recovery_code);

  const record = await RecoveryCode.scope('withSecret').findOne({ where: { username } });
  const isMatch = await bcrypt.compare(recoveryCode, record ? record.Recovery_code : DUMMY_HASH);

  if (!record || !isMatch) throw ApiError.badRequest('اسم المستخدم أو كود الاسترجاع غير صحيح');

  // توكن قصير العمر لا يصلح إلا لخطوة تعيين مفتاح جديد
  const recoveryToken = jwt.sign(
    { sub: username, scope: 'recovery' },
    config.jwt.recoverySecret,
    { algorithm: 'HS256', expiresIn: config.jwt.recoveryExpiresIn }
  );

  res.json({
    message: 'تم التحقق من كود الاسترجاع، حدّد مفتاح مرور جديداً الآن.',
    recoveryToken
  });
};

exports.resetPassKey = async (req, res) => {
  const recoveryToken = str(req.body.recoveryToken);
  const pass_key = validatePassKey(req.body.pass_key, 'مفتاح المرور الجديد');
  const recoveryCode = validateRecoveryCode(req.body.Recovery_code);

  let payload;
  try {
    payload = jwt.verify(recoveryToken, config.jwt.recoverySecret, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.badRequest('انتهت صلاحية التحقق، ابدأ استرجاع الحساب من جديد');
  }
  if (payload.scope !== 'recovery') throw ApiError.forbidden('هذا الرمز لا يصلح لهذه العملية');

  const username = payload.sub;
  const [hash, recoveryHash] = await Promise.all([
    bcrypt.hash(pass_key, config.bcryptRounds),
    bcrypt.hash(recoveryCode, config.bcryptRounds)
  ]);

  const user = await User.scope('withSecret').findOne({ where: { username } });
  if (!user) throw ApiError.notFound('الحساب غير موجود');
  if (pass_key === recoveryCode) throw ApiError.badRequest('كود الاسترجاع يجب أن يختلف عن مفتاح المرور');

  const transaction = await RecoveryCode.sequelize.transaction();
  try {
    await User.update({ pass_key: hash }, { where: { username }, transaction });
    // استبدال كود الاسترجاع حتى لا يبقى الكود المسرّب صالحاً
    await RecoveryCode.upsert({ username, Recovery_code: recoveryHash }, { transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const safeUser = await User.findOne({ where: { username } });
  res.json({
    message: 'تم تعيين مفتاح مرور جديد وكود استرجاع جديد',
    user: safeUser.toSafeJSON(),
    token: signToken(safeUser)
  });
};
