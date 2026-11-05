const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const auth = require('../controllers/authController');
const { authLimiter, loginLimiter } = require('../middlewares/rateLimiters');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', authLimiter, asyncHandler(auth.register));
router.post('/login', loginLimiter, asyncHandler(auth.login));
router.get('/me', verifyToken, asyncHandler(auth.me));
router.post('/recovery/verify', authLimiter, asyncHandler(auth.verifyRecoveryCode));
router.post('/recovery/reset', authLimiter, asyncHandler(auth.resetPassKey));

module.exports = router;
