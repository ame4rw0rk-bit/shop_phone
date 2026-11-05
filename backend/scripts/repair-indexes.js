/**
 * إصلاح الأضرار التي يتركها sequelize.sync({ alter: true }):
 * مضاعفة مؤشرات UNIQUE على نفس العمود عند كل إقلاع.
 *
 * التسلسل: npm run db:repair
 * السكربت idempotent — يمكن تشغيله أكثر من مرة، ولا يحذف أي بيانات.
 */
const sequelize = require('../config/db');

const TABLES = {
  users: { keepUnique: ['username'] },
  recovery_codes: { keepUnique: ['username'] },
  products: { keepUnique: [] },
  favorites: { keepUnique: [] }
};

const EXTRA_INDEXES = [
  { table: 'products', name: 'idx_products_condition', columns: ['condition'] },
  { table: 'products', name: 'idx_products_in_stock', columns: ['inStock'] },
  { table: 'products', name: 'idx_products_price', columns: ['price'] },
  { table: 'users', name: 'idx_users_role', columns: ['role'] }
];

async function loadIndexes(table) {
  const [rows] = await sequelize.query(
    `SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    { replacements: [table] }
  );

  const byName = new Map();
  for (const row of rows) {
    const name = row.INDEX_NAME;
    if (!byName.has(name)) {
      byName.set(name, { name, columns: [], unique: Number(row.NON_UNIQUE) === 0 });
    }
    byName.get(name).columns.push(row.COLUMN_NAME);
  }
  return [...byName.values()];
}

function isPreferred(name, column) {
  // المؤشر الذي اسمه اسم العمود هو الأصلي الذي نُبقيه
  return name === column;
}

async function repairTable(table, rules) {
  const indexes = await loadIndexes(table);
  const seenUnique = new Set();
  const drops = [];

  const sorted = [...indexes].sort((a, b) => {
    const aPreferred = isPreferred(a.name, a.columns[0]) ? 0 : 1;
    const bPreferred = isPreferred(b.name, b.columns[0]) ? 0 : 1;
    return aPreferred - bPreferred || a.name.localeCompare(b.name);
  });

  for (const index of sorted) {
    if (index.name === 'PRIMARY') continue;
    const signature = index.columns.join(',');

    if (index.unique) {
      const wanted = rules.keepUnique.includes(index.columns[0]) && index.columns.length === 1;
      if (!wanted) {
        drops.push(`ALTER TABLE \`${table}\` DROP INDEX \`${index.name}\``);
        console.log(`  ✖ حذف UNIQUE غير مرغوب: ${table}.${index.name} (${signature})`);
        continue;
      }
      if (seenUnique.has(signature)) {
        drops.push(`ALTER TABLE \`${table}\` DROP INDEX \`${index.name}\``);
        console.log(`  ✖ حذف UNIQUE مكرر: ${table}.${index.name}`);
        continue;
      }
      seenUnique.add(signature);
      console.log(`  ✔ إبقاء UNIQUE: ${table}.${index.name}`);
    }
  }

  for (const sql of drops) await sequelize.query(sql);
  return drops.length;
}

async function addMissingIndexes() {
  for (const index of EXTRA_INDEXES) {
    const [rows] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      { replacements: [index.table, index.name] }
    );
    if (Number(rows[0].c) > 0) continue;

    // أسماء الأعمدة تُلفّ بعلامات.backtick — escape() تنتج نصاً وليس معرّفاً
    const columns = index.columns.map((c) => `\`${c.replace(/[^A-Za-z0-9_]/g, '')}\``).join(', ');
    await sequelize.query(
      `ALTER TABLE \`${index.table}\` ADD INDEX \`${index.name}\` (${columns})`
    );
    console.log(`  + مؤشر جديد: ${index.table}.${index.name}`);
  }
}

async function verifyColumns() {
  const expected = {
    users: ['id', 'name', 'username', 'pass_key', 'role', 'createdAt', 'updatedAt'],
    products: ['id', 'title', 'description', 'price', 'imageUrl', 'inStock', 'condition', 'createdAt', 'updatedAt'],
    recovery_codes: ['id', 'username', 'Recovery_code', 'createdAt', 'updatedAt'],
    favorites: ['userId', 'productId', 'createdAt', 'updatedAt']
  };

  for (const [table, columns] of Object.entries(expected)) {
    const [rows] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      { replacements: [table] }
    );
    const existing = new Set(rows.map((r) => r.COLUMN_NAME));
    const missing = columns.filter((c) => !existing.has(c));
    if (missing.length) {
      console.warn(`  ⚠ أعمدة ناقصة في ${table}: ${missing.join(', ')} — شغّل npm run db:sync`);
    } else {
      console.log(`  ✔ الأعمدة سليمة في ${table}`);
    }
  }
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log('فحص الجداول وإصلاح المؤشرات المكررة...\n');

    for (const [table, rules] of Object.entries(TABLES)) {
      const [exists] = await sequelize.query(
        `SELECT COUNT(*) AS c FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        { replacements: [table] }
      );
      if (!Number(exists[0].c)) {
        console.log(`— ${table}: الجدول غير موجود، سيُنشأ عند الإقلاع.`);
        continue;
      }
      console.log(`— ${table}`);
      await repairTable(table, rules);
    }

    console.log('\nإضافة المؤشرات الاستعلامية الناقصة...');
    await addMissingIndexes();

    console.log('\nالتحقق من الأعمدة...');
    await verifyColumns();

    console.log('\n✅ انتهى الإصلاح.');
  } catch (error) {
    console.error('❌ فشل الإصلاح:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
