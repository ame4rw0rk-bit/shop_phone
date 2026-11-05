const express = require('express');
const config = require('../config/env');

const router = express.Router();

// إعدادات عامة تحتاجها الواجهة بدون إعادة بناء بعد النشر
router.get('/', (req, res) => {
  res.json({
    storeName: config.public.storeName,
    telegramUsername: config.public.telegramUsername,
    supportEmail: config.public.supportEmail,
    currency: ['USD', 'IQD']
  });
});

module.exports = router;
