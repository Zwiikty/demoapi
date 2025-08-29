const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { readAmountFromSlip } = require('../controllers/paymentOCR.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');


router.post('/generate-qr', authenticate, authorize(['CUSTOMER']), paymentController.generatePromptPayQR);
router.post('/ocr-read', authenticate, authorize(['ADMIN']), readAmountFromSlip);
router.post('/verify-payment', authenticate, authorize(['ADMIN']), paymentController.adminVerifyPayment);
router.post('/reject-payment', authenticate, authorize(['ADMIN']), paymentController.adminRejectedPayment);
router.get('/payment-status', authenticate, authorize(['ADMIN','CUSTOMER']), paymentController.getPaymentStatus);
module.exports = router;