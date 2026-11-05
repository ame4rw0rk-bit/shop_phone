const { Op } = require('sequelize');
const { Product } = require('../models');
const ApiError = require('../middlewares/ApiError');
const {
  requireString, optionalString, parsePrice, parseBoolean, parseId, parseImageUrl, str
} = require('../utils/validators');

const MAX_PAGE_SIZE = 60;

const PUBLIC_ATTRIBUTES = ['id', 'title', 'description', 'price', 'imageUrl', 'inStock', 'condition', 'createdAt'];

function readProductPayload(body) {
  const title = requireString(body, 'title', { label: 'اسم الجهاز', min: 2, max: 140 });
  const price = parsePrice(body.price);
  const condition = requireString({ condition: body.condition }, 'condition', {
    label: 'حالة الجهاز',
    min: 3,
    max: 4,
    pattern: /^(new|used)$/,
    patternError: 'حالة الجهاز يجب أن تكون new أو used'
  });
  const description = optionalString(body, 'description', { max: 5000 });
  const imageUrl = parseImageUrl(body.imageUrl);
  const inStock = parseBoolean(body.inStock, true);

  return { title, price, condition, description, imageUrl, inStock };
}

function serialize(product) {
  const data = product.get({ plain: true });
  return { ...data, price: Number(data.price) };
}

exports.getAll = async (req, res) => {
  const page = Math.min(10_000, Math.max(1, Number.parseInt(str(req.query.page), 10) || 1));
  const rawLimit = Number.parseInt(str(req.query.limit), 10);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : MAX_PAGE_SIZE));

  const where = {};

  const { condition, search, available } = req.query;
  if (condition) {
    if (!/^(new|used)$/.test(str(condition))) throw ApiError.badRequest('فلتر الحالة غير صالح');
    where.condition = str(condition);
  }
  if (available !== undefined && available !== '') {
    where.inStock = parseBoolean(available, true);
  }

  // القيمة الفارغة يجب أن تُتجاهل، وNumber('') يساوي 0 — لذلك الفحص هنا على النص
  const toNumber = (raw) => {
    const text = str(raw);
    if (!text) return undefined;
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };
  const priceMin = toNumber(req.query.min);
  const priceMax = toNumber(req.query.max);
  const range = [];
  if (priceMin !== undefined) range.push({ [Op.gte]: priceMin });
  if (priceMax !== undefined) range.push({ [Op.lte]: priceMax });
  if (range.length === 1) where.price = range[0];
  else if (range.length === 2) where.price = { [Op.and]: range };

  const keyword = str(search).slice(0, 60);
  if (keyword) {
    const like = `%${keyword.replace(/[%_\\]/g, '\\$&')}%`;
    where[Op.or] = [{ title: { [Op.like]: like } }, { description: { [Op.like]: like } }];
  }

  const orderField = Product.SORTABLE_FIELDS[str(req.query.sort)] || Product.SORTABLE_FIELDS.newest;

  const { count, rows } = await Product.findAndCountAll({
    where,
    attributes: PUBLIC_ATTRIBUTES,
    order: [orderField],
    limit,
    offset: (page - 1) * limit,
    distinct: true
  });

  res.json({
    items: rows.map(serialize),
    page,
    limit,
    total: count,
    totalPages: Math.max(1, Math.ceil(count / limit))
  });
};

exports.getById = async (req, res) => {
  const product = await Product.findByPk(parseId(req.params.id), { attributes: PUBLIC_ATTRIBUTES });
  if (!product) throw ApiError.notFound('الجهاز غير موجود');
  res.json({ item: serialize(product) });
};

exports.create = async (req, res) => {
  const payload = readProductPayload(req.body);
  const product = await Product.create(payload);
  res.status(201).json({ message: 'تم إضافة الجهاز بنجاح', item: serialize(product) });
};

exports.update = async (req, res) => {
  const product = await Product.findByPk(parseId(req.params.id));
  if (!product) throw ApiError.notFound('الجهاز غير موجود');

  await product.update(readProductPayload(req.body));
  res.json({ message: 'تم تحديث بيانات الجهاز', item: serialize(product) });
};

exports.remove = async (req, res) => {
  const deleted = await Product.destroy({ where: { id: parseId(req.params.id) } });
  if (!deleted) throw ApiError.notFound('الجهاز غير موجود');
  res.json({ message: 'تم حذف الجهاز بنجاح' });
};

exports.stats = async (req, res) => {
  const [total, newCount, usedCount, outOfStock] = await Promise.all([
    Product.count(),
    Product.count({ where: { condition: 'new' } }),
    Product.count({ where: { condition: 'used' } }),
    Product.count({ where: { inStock: false } })
  ]);
  res.json({ total, newCount, usedCount, outOfStock });
};
