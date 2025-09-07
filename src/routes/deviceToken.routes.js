const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth.middleware');
const {
  registerToken,
  unregisterToken,
} = require('../controllers/deviceToken.controller');

// ต้องล็อกอินก่อนเท่านั้น
router.post('/register', authenticate, registerToken);
router.post('/unregister', authenticate, unregisterToken);

module.exports = router;