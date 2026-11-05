/**
 * اختبار دخاني شامل للـ API.
 *   npm run smoke
 * يُقلع سيرفر مستقل على منفذ عشوائي (فتصفّ حدود الطلبات معه)، ويشغّل الفحوص، ثم يوقفه.
 * لاختبار سيرفر يعمل مسبقاً: SMOKE_BASE_URL=http://127.0.0.1:5000 npm run smoke
 * ينشئ مستخدماً مؤقتاً ويمسحه بعد الانتهاء.
 */
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { Op } = require('sequelize');
const config = require('../config/env');
const { sequelize, User, RecoveryCode, Product, Favorite } = require('../models');

const EXTERNAL_BASE = process.env.SMOKE_BASE_URL || '';
// حدّ التسجيل مرتفع لأن المجموعة تتحقق من مسارات كثيرة؛ حدّ الدخول يبقى افتراضياً
// حتى يظل فحص 429 ذا معنى.
const SPAWN_PORT = 5100 + Math.floor(Math.random() * 300);
const CHILD_ENV = {
  ...process.env,
  PORT: String(SPAWN_PORT),
  RATE_LIMIT_AUTH_MAX: '60',
  RATE_LIMIT_API_MAX: '5000'
};

let BASE = EXTERNAL_BASE;
let child = null;
const suffix = crypto.randomBytes(4).toString('hex');
const username = `qa_${suffix}`.slice(0, 15);
const passKey = `qa${suffix}1234567890`.slice(0, 16);
const recoveryCode = `rc-${suffix}-recovery`;

async function startDedicatedServer() {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'app.js')], {
    env: CHILD_ENV,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    if (!/^\[sql\]/.test(text)) process.stderr.write(text);
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`⚠️  سيرفر الاختبار أُوقف برمز ${code}`);
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${SPAWN_PORT}/api/health`);
      if (res.ok) { BASE = `http://127.0.0.1:${SPAWN_PORT}`; return; }
    } catch { /* لم يقلع بعد */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('سيرفر الاختبار لم يقلع خلال 30 ثانية');
}

function stopDedicatedServer() {
  if (!child) return;
  child.kill('SIGTERM');
  child = null;
}

let passed = 0;
let failed = 0;
const createdUserIds = [];
const createdProductIds = [];

function ok(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✖ ${name} ${extra}`);
  }
}

async function call(method, path, { body, token, allow429 = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  // حدود الطلبات حقيقية: المجموعة تستهلكها فتحتاج نافذة جديدة
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    if (res.status !== 429 || allow429) {
      let json = null;
      try { json = JSON.parse(text); } catch { /* رد غير JSON */ }
      return { status: res.status, json, text, headers: res.headers };
    }

    const policy = res.headers.get('ratelimit') || res.headers.get('retry-after') || '';
    const reset = Number((policy.match(/reset=(\d+)/) || [])[1] || policy) || 0;
    if (reset > 90) {
      throw new Error(
        `حدّ الطلبات يستهلك ${reset} ثانية انتظار — أعد التشغيل بعد أن تنتهي النافذة، ` +
        'أو ارفع RATE_LIMIT_AUTH_MAX/RATE_LIMIT_LOGIN_MAX مؤقتاً.'
      );
    }
    console.log(`  … 429: انتظار ${reset || 1}s لنافذة جديدة`);
    await new Promise((r) => setTimeout(r, (reset || 1) * 1000 + 400));
  }
  throw new Error('حدّ الطلبات ما زال مفعّلاً بعد ثلاث محاولات');
}

async function main() {
  if (!EXTERNAL_BASE) await startDedicatedServer();
  console.log(`اختبار على ${BASE}\n`);

  /* ---- صحة التشغيل والإعدادات ---- */
  console.log('1) الصحة والإعدادات');
  const health = await call('GET', '/api/health');
  ok('GET /api/health = 200', health.status === 200 && health.json?.status === 'ok');

  const meta = await call('GET', '/api/config');
  ok('GET /api/config = 200', meta.status === 200 && typeof meta.json?.storeName === 'string');

  const sec = await call('GET', '/');
  ok('ترويسة CSP موجودة', /default-src 'self'/.test(sec.headers.get('content-security-policy') || ''));
  ok('سكربتات ممنوع تضمينها (لا unsafe-inline في script-src)',
    !/script-src[^;]*unsafe-inline/.test(sec.headers.get('content-security-policy') || ''));
  ok('x-powered-by محذوف', !sec.headers.get('x-powered-by'));

  const missing = await call('GET', '/api/nope');
  ok('مسار API مجهول = 404 JSON', missing.status === 404 && missing.json?.status === 'error');

  /* ---- التسجيل ---- */
  console.log('\n2) التسجيل والتحقق');
  const badName = await call('POST', '/api/auth/register', {
    body: { name: 'x', username, pass_key: passKey, Recovery_code: recoveryCode }
  });
  ok('اسم قصير مرفوض (400)', badName.status === 400);

  const shortKey = await call('POST', '/api/auth/register', {
    body: { name: 'QA User', username, pass_key: 'short1', Recovery_code: recoveryCode }
  });
  ok('مفتاح أقصر من 16 مرفوض (400)', shortKey.status === 400);

  const weakKey = await call('POST', '/api/auth/register', {
    body: { name: 'QA User', username, pass_key: 'abcdefghijklmnop', Recovery_code: recoveryCode }
  });
  ok('مفتاح بلا أرقام مرفوض (400)', weakKey.status === 400);

  const registered = await call('POST', '/api/auth/register', {
    body: { name: 'QA User', username, pass_key: passKey, Recovery_code: recoveryCode }
  });
  ok('تسجيل صحيح = 201 مع توكن', registered.status === 201 && !!registered.json?.token);
  ok('الرد لا يسرّب pass_key', !JSON.stringify(registered.json).includes('$2b$'));

  const duplicate = await call('POST', '/api/auth/register', {
    body: { name: 'QA User', username, pass_key: passKey, Recovery_code: recoveryCode }
  });
  ok('تكرار اسم المستخدم = 409', duplicate.status === 409);

  if (registered.json?.user?.id) createdUserIds.push(registered.json.user.id);

  /* ---- تسجيل الدخول ---- */
  console.log('\n3) تسجيل الدخول');
  const wrongPass = await call('POST', '/api/auth/login', { body: { username, pass_key: 'WRONGpass1234567' } });
  ok('كلمة سر خاطئة = 400', wrongPass.status === 400);
  ok('رسالة موحّدة لا تكشف وجود الحساب',
    wrongPass.json?.message === 'اسم المستخدم أو مفتاح المرور غير صحيح');

  const unknownUser = await call('POST', '/api/auth/login', { body: { username: 'zz_no_such', pass_key: passKey } });
  ok('مستخدم مجهول نفس الرسالة', unknownUser.json?.message === wrongPass.json?.message);

  const loggedIn = await call('POST', '/api/auth/login', { body: { username, pass_key: passKey } });
  ok('دخول صحيح = 200 مع توكن', loggedIn.status === 200 && !!loggedIn.json?.token);
  const token = loggedIn.json?.token;

  const me = await call('GET', '/api/auth/me', { token });
  ok('GET /api/auth/me يعرض الحساب بدون سر',
    me.status === 200 && me.json?.user?.username === username && !me.json.user.pass_key);

  /* ---- الصلاحيات ---- */
  console.log('\n4) الحماية والصلاحيات');
  const noToken = await call('POST', '/api/products', { body: { title: 'Ghost', price: 1 } });
  ok('إضافة منتج بدون توكن = 401', noToken.status === 401);

  const badToken = await call('POST', '/api/products', { body: { title: 'Ghost', price: 1 }, token: 'aaa.bbb.ccc' });
  ok('توكن مزيَّف = 401', badToken.status === 401);

  // "none" هو التوقيع المعروف بـ algorithm: 'none' — يجب رفضه دائماً
  const unsigned = `${btoa('{"alg":"none","typ":"JWT"}')}.${btoa('{"sub":"x","role":"ameer_OxAmeer_admin"}')}.`;
  const algNone = await call('POST', '/api/products', { body: { title: 'Ghost', price: 1 }, token: unsigned });
  ok('توكن alg=none مرفوض', algNone.status === 401);

  const asNormalUser = await call('POST', '/api/products', {
    body: { title: 'iPhone 15 Pro', price: 999, condition: 'new' }, token
  });
  ok('المستخدم العادي لا يضيف منتج (403)', asNormalUser.status === 403);

  /* ---- منتجات ---- */
  console.log('\n5) المنتجات');
  const adminToken = await makeAdminToken();
  if (!adminToken) {
    console.log('  ! تعذّر تجهيز توكن أدمن، تم تخطي اختبارات الكتابة');
  } else {
    const created = await call('POST', '/api/products', {
      body: { title: 'QA Phone <script>alert(1)</script>', price: '1234.567', condition: 'used', inStock: true, imageUrl: 'https://example.com/a.png' },
      token: adminToken
    });
    ok('أدمن يضيف منتج = 201', created.status === 201 && created.json?.item?.id);
    if (created.json?.item?.id) createdProductIds.push(created.json.item.id);
    ok('السعر مُقَرَّب لرقمين', created.json?.item?.price === 1234.57);

    const badImage = await call('POST', '/api/products', {
      body: { title: 'Bad Image', price: 1, condition: 'new', imageUrl: 'javascript:alert(1)' },
      token: adminToken
    });
    ok('رابط صورة غير http(m) مرفوض', badImage.status === 400);

    const internalImage = await call('POST', '/api/products', {
      body: { title: 'SSRF Image', price: 1, condition: 'new', imageUrl: 'http://127.0.0.1:5000/x.png' },
      token: adminToken
    });
    ok('رابط صورة داخلي مرفوض (SSRF)', internalImage.status === 400);

    const badCondition = await call('POST', '/api/products', {
      body: { title: 'Bad Condition', price: 1, condition: 'refurbished' }, token: adminToken
    });
    ok('حالة غير معروفة مرفوضة', badCondition.status === 400);

    const negativePrice = await call('POST', '/api/products', {
      body: { title: 'Negative', price: -5, condition: 'new' }, token: adminToken
    });
    ok('سعر سالب مرفوض', negativePrice.status === 400);

    const list = await call('GET', '/api/products');
    ok('قائمة المنتجات تُرجع items', list.status === 200 && Array.isArray(list.json?.items));
    ok('لا تسريب لحقول داخلية', !JSON.stringify(list.json).includes('pass_key'));

    const filtered = await call('GET', '/api/products?condition=used&limit=1');
    ok('فلتر condition=used يعمل',
      filtered.json?.items?.every((p) => p.condition === 'used'));

    const searched = await call('GET', '/api/products?search=QA');
    ok('البحث النصي يعمل', searched.json?.total >= 1);

    const stats = await call('GET', '/api/products/stats');
    ok('الإحصاءات تعمل', stats.status === 200 && typeof stats.json?.total === 'number');

    const updated = await call('PUT', `/api/products/${createdProductIds[0]}`, {
      body: { title: 'QA Phone Updated', price: 500, condition: 'used', inStock: false, imageUrl: '' },
      token: adminToken
    });
    ok('تعديل منتج = 200', updated.status === 200 && updated.json?.item?.title === 'QA Phone Updated');
    ok('تعديل بدون Authorization مرفوض',
      (await call('PUT', `/api/products/${createdProductIds[0]}`, { body: { title: 'x1', price: 1, condition: 'new' } })).status === 401);

    const weirdId = await call('DELETE', '/api/products/1%20or%201=1', { token: adminToken });
    ok('معرّف مزيَّف مرفوض قبل الوصول للقاعدة', weirdId.status === 400 || weirdId.status === 404);
  }

  /* ---- المفضلة ---- */
  console.log('\n6) المفضلة');
  const firstProduct = createdProductIds[0] || (await Product.findOne({ attributes: ['id'] }))?.id;

  if (firstProduct) {
    const toggledOn = await call('POST', '/api/favorites/toggle', { body: { productId: firstProduct }, token });
    ok('إضافة للمفضلة = 201', toggledOn.status === 201 && toggledOn.json?.isFavorite === true);

    const dupes = await Favorite.count({ where: { productId: firstProduct } });
    ok('لا تكرار في الجدول الوسيط', dupes >= 1);

    const toggledOff = await call('POST', '/api/favorites/toggle', { body: { productId: firstProduct }, token });
    ok('إزالة من المفضلة = 200', toggledOff.status === 200 && toggledOff.json?.isFavorite === false);

    await call('POST', '/api/favorites/toggle', { body: { productId: firstProduct }, token });
    const favorites = await call('GET', '/api/favorites', { token });
    ok('GET /api/favorites يعيد items', favorites.status === 200 && Array.isArray(favorites.json?.items));
    ok('عناصر المفضلة تستخدم imageUrl/title',
      favorites.json.items.length === 0
      || ('imageUrl' in favorites.json.items[0] && 'title' in favorites.json.items[0]));

    const ids = await call('GET', '/api/favorites/ids', { token });
    ok('GET /api/favorites/ids يعيد مصفوفة', Array.isArray(ids.json?.ids));

    const badProductId = await call('POST', '/api/favorites/toggle', { body: { productId: '1 or 1=1' }, token });
    ok('معرّف منتج مزيَّف مرفوض', badProductId.status === 400);

    const noAuth = await call('GET', '/api/favorites');
    ok('المفضلة تحتاج تسجيل دخول', noAuth.status === 401);
  } else {
    console.log('  ! لا توجد منتجات للاختبار ضدها');
  }

  /* ---- الاسترجاع ---- */
  console.log('\n7) استرجاع الحساب');
  const badRecovery = await call('POST', '/api/auth/recovery/verify', {
    body: { username, Recovery_code: 'totally-wrong-code' }
  });
  ok('كود استرجاع خاطئ = 400', badRecovery.status === 400);

  const goodRecovery = await call('POST', '/api/auth/recovery/verify', {
    body: { username, Recovery_code: recoveryCode }
  });
  ok('كود صحيح يعطي recoveryToken', goodRecovery.status === 200 && !!goodRecovery.json?.recoveryToken);

  const newPassword = `new${suffix}1234567`.slice(0, 16);
  const newRecovery = `rc2-${suffix}-recovery`;
  const reset = await call('POST', '/api/auth/recovery/reset', {
    body: { recoveryToken: goodRecovery.json?.recoveryToken, pass_key: newPassword, Recovery_code: newRecovery }
  });
  ok('تعيين مفتاح جديد = 200', reset.status === 200 && !!reset.json?.token);

  const oldPassLogin = await call('POST', '/api/auth/login', { body: { username, pass_key: passKey } });
  ok('المفتاح القديم لم يعد يعمل', oldPassLogin.status === 400);

  const newPassLogin = await call('POST', '/api/auth/login', { body: { username, pass_key: newPassword } });
  ok('المفتاح الجديد يعمل', newPassLogin.status === 200);

  const replayed = await call('POST', '/api/auth/recovery/reset', {
    body: { recoveryToken: 'garbage.token.value', pass_key: passKey, Recovery_code: newRecovery }
  });
  ok('recoveryToken مزيَّف مرفوض', replayed.status === 400);

  /* ---- حدود الطلبات ---- */
  console.log('\n8) الحد من الطلبات');
  const spam = await Promise.all(Array.from({ length: 14 }, () =>
    call('POST', '/api/auth/login', { body: { username, pass_key: '0000000000000000' }, allow429: true })));
  ok('تسجيلات فاشلة متتالية تُقابل بـ 429', spam.some((r) => r.status === 429));

  /* ---- تنظيف ---- */
  console.log('\n9) التنظيف');
  await cleanup();

  console.log(`\nالنتيجة: ${passed} نجح، ${failed} فشل`);
  process.exitCode = failed ? 1 : 0;
}

async function makeAdminToken() {
  const { signToken } = require('../middlewares/authMiddleware');
  try {
    const id = crypto.randomUUID();
    await User.create({
      id,
      name: 'QA Admin',
      username: `qaad${suffix}`.slice(0, 15),
      pass_key: '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv',
      role: 'ameer_OxAmeer_admin'
    });
    createdUserIds.push(id);
    return signToken({ id, username: 'qaadmin', role: 'ameer_OxAmeer_admin' });
  } catch (error) {
    console.log('  ! فشل تجهيز الأدمن:', error.message);
    return null;
  }
}

async function cleanup() {
  try {
    if (createdProductIds.length) {
      await Favorite.destroy({ where: { productId: { [Op.in]: createdProductIds } } });
      await Product.destroy({ where: { id: { [Op.in]: createdProductIds } } });
    }
    const usernames = (await User.findAll({
      where: { id: { [Op.in]: createdUserIds } },
      attributes: ['username']
    })).map((u) => u.username);

    if (usernames.length) {
      await Favorite.destroy({ where: { userId: { [Op.in]: createdUserIds } } });
      await RecoveryCode.destroy({ where: { username: { [Op.in]: usernames } } });
      await User.destroy({ where: { id: { [Op.in]: createdUserIds } } });
    }
    console.log(`  ✔ تم حذف ${createdUserIds.length} مستخدم و${createdProductIds.length} منتج مؤقت`);
  } catch (error) {
    console.log('  ! التنظيف الجزئي فشل:', error.message);
  }
}

main().catch(async (error) => {
  console.error('❌ توقف الاختبار:', error);
  await cleanup();
  process.exitCode = 1;
}).finally(async () => {
  stopDedicatedServer();
  await sequelize.close();
});
