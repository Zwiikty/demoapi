const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

router.post('/', authenticate, authorize(['CUSTOMER']), bookingController.createBooking);

const { createWalkInBooking } = require('../controllers/walkin.controller');
router.post('/walkin', authenticate, authorize(['ADMIN']), createWalkInBooking);

router.get('/my-bookings', authenticate, authorize(['CUSTOMER']), bookingController.getMyBookings);
router.put('/update-status/:bookingId', authenticate, authorize(['ADMIN']), bookingController.updateStatus);
router.put('/rescheduled/:bookingId', authenticate, authorize(['CUSTOMER']), bookingController.rescheduleBooking);
router.get('/', authenticate, authorize(['ADMIN']), bookingController.getAllBookings);
router.delete('/cancel/:bookingId', authenticate, authorize(['ADMIN']), bookingController.adminCancelBooking);
router.put('/upload-slip/:bookingId', authenticate, authorize(['CUSTOMER']), upload.single('slipImage'), bookingController.uploadSlip);

module.exports = router;
