const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');


router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/forget-password', authController.forgetPassword);
router.post('/reset-password', authController.resetPassword);

router.get('/admin', authController.adminRoute);
router.get('/customer', authController.customerRoute);

module.exports = router;