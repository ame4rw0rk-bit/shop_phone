# TechGadget — متجر أجهزة على تليجرام

واجهة عربية (RTL) + API مبني بـ Express و Sequelize/MySQL، مقدَّمان من عملية واحدة:
Express يخدم ملفات `frontend/` ويخدم الـ API تحت `/api`.

---

## 1. التشغيل محلياً

المتطلبات: Node 18+ و MySQL 8.

```bash
cd backend
npm install
cp .env.example .env        # ثم عدّل القيم
npm run dev                 # التطوير (nodemon)
npm start                   # التشغيل العادي
```

افتح `http://localhost:5000`.

### إنشاء أول حساب أدمن

الحساب العادي لا يصل إلى `admin.html`. أنشئ حساب الإدارة بالأمر:

```bash
cd backend
SEED_ADMIN_NAME="اسمك" \
SEED_ADMIN_USERNAME="username_صغير" \
SEED_ADMIN_PASS_KEY="16رمزاً_حرف ورقم" \
SEED_ADMIN_RECOVERY_CODE="كود-الاسترجاع" \
npm run seed:admin
```

التمرير عبر متغيرات البيئة هنا يقصد منه ألا تُخزَّن الأسرار في ملف.
**احذف أسطر `SEED_ADMIN_*` من `.env` إن استخدمتها مرة.**

كود الاسترجاع هو وسيلة استرجاع الحساب الوحيدة، ولا يُعرض للمستخدم إلا مرة واحدة
عند إنشاء الحساب — لا تُعِده على الطلبات.

---

## 2. النشر بـ Docker

```bash
cp .env.example .env        # في جذر المشروع
# املئ: JWT_SECRET, RECOVERY_JWT_SECRET, DB_ROOT_PASS, DB_USER, DB_PASS
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # لكل سر

docker compose up -d --build
docker compose logs -f app
```

الخدمة تُقلع بعد أن تصبح قاعدة البيانات صحيحة (`depends_on: service_healthy`)،
ولها فحص صحة على `/api/health` كل 30 ثانية.

> إن كان لديك MySQL مُدار خارجياً، احذف خدمة `db` من `docker-compose.yml`
> ووجّه `DB_HOST` إلى خادمك، وفعّل `DB_SSL=true`.

### بدون Docker

```bash
cd backend && npm ci --omit=dev
pm2 start app.js --name techgadget --node-args="--max-old-space-size=512"
pm2 save && pm2 startup
```

ضع nginx أمامها مع `proxy_set_header X-Forwarded-For $remote_addr;`
و`X-Forwarded-Proto $scheme;` وفعّل `TRUST_PROXY=true` في `.env`،
وإلا ستعمل حدود الطلبات على عنوان nginx بدل عنوان الزائر.

---

## 3. ما يجب ضبطه قبل النشر

| المفتاح | الإنتاج | ملاحظة |
|---|---|---|
| `JWT_SECRET` | إلزامي ≥ 32 حرف | بدونه يرفض السيرفر الإقلاع |
| `RECOVERY_JWT_SECRET` | إلزامي ≥ 32 حرف | سر مستقل عن سر الجلسة |
| `NODE_ENV=production` | إلزامي | يفعّل التحقق الصارم ويُخفي تفاصيل الأخطاء |
| `CORS_ORIGINS` | مطلوب إن فُصل الواجهة عن الـ API | اتركه فارغاً إذا خدم Express الواجهة |
| `TRUST_PROXY=true` | خلف nginx/mesh | ضروري لصحة حدود الطلبات |
| `TELEGRAM_USERNAME` | حساب المتجر | القيم النموذجية تُحجب تلقائياً |
| `DB_SYNC` | `true` للتهيئة الأولى | بعد ذلك اجعلها `false` |

الخادم يرفض الإقلاع في الإنتاج عند نقص الأسرار، بدل أن يعمل بسرّ ضعيف.

---

## 4. الفحص والصيانة

```bash
cd backend
npm run smoke      # 50 فحص على الـ API (يُقلّع سيرفره الخاص على منفذ عشوائي ثم يوقفه)
npm run db:repair  # يفهرس الأعمدة ويصلح المؤشرات دون حذف بيانات
```

`npm run smoke` مستقل عن السيرفر الذي تعمل عليه، لذا يمكن تكراره مباشرة بلا
انتظار انتهاء نافذة حدود الطلبات. لاختبار سيرفر يعمل فعلاً:

```bash
SMOKE_BASE_URL=http://127.0.0.1:5000 npm run smoke   # ينتظر نافذة الحدود إن استُهلكت
```

`db:repair` idempotent: يحذف المؤشرات UNIQUE المكرّرة التي يخلّفها
`sync({alter:true})` ويضيف مؤشرات الاستعلامات، ولا يمسح أي صف.

### النسخ الاحتياطي

```bash
mysqldump -u <user> -p --single-transaction --routines Ageel_phone > backup.sql
```

---

## 5. الحماية المطبّقة

- **CSP** بـ `script-src 'self'`: لا سكربت مضمّن في أي صفحة، والتعليمة
  `App.el` ترفض خيار `html` — العرض كله عبر `textContent` ضد XSS.
- **صور**: يُرفض أي رابط ليس `http(s)` أو يشير إلى عنوان داخلي (حجب SSRF
  عبر `<img>` والروابط الداخلية).
- **JWT**: خوارزمية مثبّتة على HS256 (سدّ هجمة `alg:none`/`RS256`-تحويل)،
  ومفتاح الاسترجاع يوقّع بسرّ مختلف وصلاحية 10 دقائق.
- **كلمة المرور**: bcrypt بـ 12 دورة، والعمود `pass_key` مستثنى من كل قراءة
  بفضل `defaultScope`، ويُسجّل الدخول بمقارنة وهمية عند عدم وجود المستخدم
  حتى لا يختلف زمن الرد بين مستخدم موجود وغير موجود (منع حصر الأسماء).
- **حدود الطلبات**: نوافذ منفصلة لـ `/api` وتسجيل الدخول والتسجيل، مع ترويسات
  `RateLimit` معيارية.
- **المدخلات**: تنقية مفاتيح النموذج الأولي (`__proto__`…) وحروف التحكم،
  و`hpp` ضد تكديس الاستعلامات، و`helmet` للترويسات الأمنية، و`bodyLimit` على
  حجم الجسم.
- **CORS**: قائمة نطاقات صريحة وبدون `credentials`، و`origin: null` مرفوض.
- **الأخطاء**: في الإنتاج تُخفى تفاصيل 5xx عن الزائر وتُسجّل في السرفر.
- **الإغلاق اللطيف**: `SIGTERM`/`SIGINT` يوقفان الاتصال بالقاعدة قبل الخروج.

---

## 6. نقطة تصميم: مفتاح المرور لا كلمة المرور

النظام يستخدم `pass_key` بطول 16 رمزاً بالضبط ويحتوي حرفاً ورقماً، ولكل حساب
`recovery_code` مستقل يُطلب عند تعيين مفتاح جديد. القاعدة لا تخزّن أي منهما
نصاً صريحاً، لكن **كود الاسترجاع يُعرض للمستخدم مرة واحدة فقط** ولا يمكن
استعادته؛ إن ضاع، استرجاع الحساب مستحيل ويجب حذف الصف يدوياً:

```sql
DELETE FROM favorites WHERE user_id = <id>;
DELETE FROM recovery_codes WHERE user_id = <id>;
DELETE FROM users WHERE id = <id>;
```

---

## 7. الأجزاء

```
backend/
  app.js              تهيئة Express + CSP + الحدود + الملفات الساكنة
  config/env.js       مصدر الإعدادات الوحيد، يتحقق ويرفض النقص
  config/db.js        Sequelize + تجميّع الاتصالات
  models/             user, product, favorite (مجدول), recovery_code
  controllers/        auth, product, favorite, meta
  routes/             مغلّفة بـ asyncHandler (Express 4 لا ينتظر الوعود)
  middlewares/        auth, sanitize, rateLimiters, ApiError, errorHandler
  scripts/            seed-admin, repair-indexes, smoke-test, seed-demo-products
frontend/
  index.html favorites.html login.html admin.html
  css/style.css        تصميم متجاوب من الجوال إلى الشاشات الكبيرة
  js/core.js           الطبقة المشتركة: API، الكروم، المفضلة، التنبيهات
  js/home.js login.js favorites.js admin.js
```

بيانات تجريبية لمعاينة الواجهة (سبعة أجهزة بوسم `[تجربة]`):

```bash
cd backend && node scripts/seed-demo-products.js       # إضافة
cd backend && node scripts/seed-demo-products.js --clear  # حذف
```
