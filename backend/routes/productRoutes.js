const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const products = require('../controllers/productController');
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware');
const { handleUpload } = require('../middlewares/uploadMiddleware');

const router = express.Router();

// قراءة المنتجات متاحة للجميع
router.get('/', asyncHandler(products.getAll));
router.get('/stats', asyncHandler(products.stats));
router.get('/:id', asyncHandler(products.getById));

// رفع صورة (للأدمن فقط)
router.post('/upload', verifyToken, isAdmin, handleUpload, asyncHandler(products.uploadImage));

// كتابة المنتجات للأدمن فقط
router.post('/', verifyToken, isAdmin, asyncHandler(products.create));
router.put('/:id', verifyToken, isAdmin, asyncHandler(products.update));
router.delete('/:id', verifyToken, isAdmin, asyncHandler(products.remove));

module.exports = router;
