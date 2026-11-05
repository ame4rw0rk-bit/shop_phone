/**
 * بيانات تجريبية للواجهة فقط — احذفها قبل الإطلاق الحقيقي:
 *   node scripts/seed-demo-products.js --clear
 */
const { Op } = require('sequelize');
const { Product, sequelize } = require('../models');

const DEMO_TAG = '[تجربة]';

const DEMO = [
  { title: `${DEMO_TAG} iPhone 15 Pro Max 256GB`, price: 1099, condition: 'new', inStock: true, description: 'تيتانيوم، شاشة 6.7 بوصة، كاميرا 48MP، علبة كاملة.' },
  { title: `${DEMO_TAG} Samsung Galaxy S24 Ultra`, price: 980, condition: 'new', inStock: true, description: 'سعة 512GB مع قلم S-Pen، ضمان الوكيل 12 شهر.' },
  { title: `${DEMO_TAG} Google Pixel 8 Pro`, price: 740, condition: 'new', inStock: true, description: 'معالج Tensor G3، تحديثات نظام لسبع سنوات.' },
  { title: `${DEMO_TAG} Xiaomi Redmi Note 13`, price: 210, condition: 'new', inStock: false, description: 'شاشة AMOLED 120Hz، كاميرا 108MP — نفد من المخزون.' },
  { title: `${DEMO_TAG} iPhone 13 128GB`, price: 420, condition: 'used', inStock: true, description: 'نظافة 95%، صحة البطارية 88%، بدون خدوش.' },
  { title: `${DEMO_TAG} iPhone 12 64GB`, price: 300, condition: 'used', inStock: true, description: 'بطارية 90% مع سماعة وغطاء هدية.' },
  { title: `${DEMO_TAG} Samsung Galaxy A55`, price: 260, condition: 'used', inStock: true, description: 'استخدام شهرين، الكرتون والملحقات كاملة.' }
];

const clear = process.argv.includes('--clear');

(async () => {
  if (clear) {
    const removed = await Product.destroy({ where: { title: { [Op.like]: `%${DEMO_TAG}%` } } });
    console.log(`تم حذف ${removed} جهاز تجريبي.`);
  } else {
    await Product.destroy({ where: { title: { [Op.like]: `%${DEMO_TAG}%` } } });
    const created = await Product.bulkCreate(DEMO);
    console.log(`تمت إضافة ${created.length} جهاز تجريبي.`);
  }
  await sequelize.close();
})();
