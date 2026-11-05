/**
 * إنشاء/ترقية حساب الأدمن من قيم SEED_ADMIN_* في .env.
 * التشغيل: npm run seed:admin
 * بعد التهيئة احذف أسطر SEED_ADMIN_* من .env.
 */
const bcrypt = require('bcrypt');
const config = require('../config/env');
const sequelize = require('../config/db');
const { syncModels, User, RecoveryCode } = require('../models');

const ADMIN_ROLE = 'ameer_OxAmeer_admin';

function die(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

(async () => {
  const { name, username, passKey, recoveryCode } = config.seed;

  if (!username) die('حدّد SEED_ADMIN_USERNAME في .env قبل التشغيل.');
  if (!/^[a-z0-9_.]{4,15}$/.test(username)) die('SEED_ADMIN_USERNAME يجب أن يطابق قواعد اسم المستخدم.');
  if (!passKey || passKey.length !== 16) die('SEED_ADMIN_PASS_KEY يجب أن يكون 16 حرفاً بالضبط.');
  if (!User.PASS_KEY_RE.test(passKey)) die('SEED_ADMIN_PASS_KEY يجب أن يحوي حرفاً ورقماً على الأقل.');
  if (!recoveryCode || recoveryCode.length < 6) die('SEED_ADMIN_RECOVERY_CODE يجب أن يكون 6 أحرف على الأقل.');
  if (passKey === recoveryCode) die('مفتاح المرور وكود الاسترجاع يجب أن يختلفا.');

  await syncModels();

  const [passHash, recoveryHash] = await Promise.all([
    bcrypt.hash(passKey, config.bcryptRounds),
    bcrypt.hash(recoveryCode, config.bcryptRounds)
  ]);

  const existing = await User.findOne({ where: { username }, attributes: ['id'] });

  if (existing) {
    await User.update({ role: ADMIN_ROLE, pass_key: passHash }, { where: { username } });
    await RecoveryCode.upsert({ username, Recovery_code: recoveryHash });
    console.log(`✅ تم تحديث الحساب الموجود "${username}" وترقيته إلى أدمن.`);
  } else {
    const user = await User.create({
      name: name || username,
      username,
      pass_key: passHash,
      role: ADMIN_ROLE
    });
    await RecoveryCode.create({ username, Recovery_code: recoveryHash });
    console.log(`✅ تم إنشاء حساب الأدمن "${username}" (${user.id}).`);
  }

  console.log('🔒 احذف أسطر SEED_ADMIN_* من .env الآن.');
  await sequelize.close();
})().catch((error) => {
  console.error('❌ فشل التهيئة:', error.message);
  process.exit(1);
});
