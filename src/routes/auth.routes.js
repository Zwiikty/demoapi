const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');


router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/forget-password', authController.forgetPassword);
router.post('/reset-password', authController.resetPassword);
router.put('/update-profile', authenticate, authController.updateUserProfile);

router.get('/admin', authController.adminRoute);
router.get('/customer', authController.customerRoute);
router.get('/whoami', authenticate, authController.WhoAmI);


module.exports = router;