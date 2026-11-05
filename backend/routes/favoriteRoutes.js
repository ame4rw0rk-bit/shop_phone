const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const favorites = require('../controllers/favoriteController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', asyncHandler(favorites.list));
router.get('/ids', asyncHandler(favorites.ids));
router.post('/toggle', asyncHandler(favorites.toggle));

module.exports = router;
