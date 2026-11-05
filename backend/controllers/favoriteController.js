const { Op } = require('sequelize');
const { Product, Favorite } = require('../models');
const ApiError = require('../middlewares/ApiError');
const { parseId } = require('../utils/validators');

const FAVORITE_ATTRIBUTES = ['id', 'title', 'description', 'price', 'imageUrl', 'inStock', 'condition'];

// إعادة المنتجات بترتيب الإضافة للمفضلة، مع تجاهل أي حذفته الإدارة
async function loadProductsFor(userId) {
  const rows = await Favorite.findAll({
    where: { userId },
    attributes: ['productId'],
    order: [['createdAt', 'DESC']]
  });
  const orderedIds = rows.map((row) => row.productId);
  if (!orderedIds.length) return [];

  const products = await Product.findAll({
    where: { id: { [Op.in]: orderedIds } },
    attributes: FAVORITE_ATTRIBUTES
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  return orderedIds
    .filter((id) => byId.has(id))
    .map((id) => ({ ...byId.get(id).get({ plain: true }), price: Number(byId.get(id).price) }));
}

// GET /api/favorites
exports.list = async (req, res) => {
  const items = await loadProductsFor(req.user.id);
  res.json({ items, total: items.length });
};

// GET /api/favorites/ids  — أخف رد لعدّاد الهيدر وزر القلب
exports.ids = async (req, res) => {
  const items = await loadProductsFor(req.user.id);
  res.json({ ids: items.map((item) => item.id) });
};

// POST /api/favorites/toggle
exports.toggle = async (req, res) => {
  const productId = parseId(req.body.productId, 'معرّف الجهاز');
  const { id } = req.user;

  const product = await Product.findByPk(productId, { attributes: ['id'] });
  if (!product) throw ApiError.notFound('الجهاز غير موجود');

  const existing = await Favorite.findOne({ where: { userId: id, productId } });

  if (existing) {
    await existing.destroy();
    return res.json({ message: 'تم إزالة الجهاز من المفضلة', isFavorite: false, productId });
  }

  try {
    await Favorite.create({ userId: id, productId });
    return res.status(201).json({ message: 'تمت إضافة الجهاز إلى المفضلة', isFavorite: true, productId });
  } catch (err) {
    // المفتاح المركّب (userId, productId) يمنع التكرار عند الضغط المزدوج
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    await Favorite.destroy({ where: { userId: id, productId } });
    return res.json({ message: 'تم إزالة الجهاز من المفضلة', isFavorite: false, productId });
  }
};
