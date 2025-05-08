const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');


router.post('/generate-qr', authenticate, authorize(['CUSTOMER']), paymentController.generatePromptPayQR);
router.post('/ocr-read', authenticate, authorize(['ADMIN']), paymentController.readAmountFromSlip);
router.post('/verify-payment', authenticate, authorize(['ADMIN']), paymentController.adminVerifyPayment);
router.post('/reject-payment', authenticate, authorize(['ADMIN']), paymentController.adminRejectedPayment);
module.exports = router;