const express = require('express');
const router = express.Router();
const courtController = require('../controllers/court.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.post('/', authenticate, authorize(['ADMIN']), courtController.createCourt);
router.put('/:courtId', authenticate, authorize(['ADMIN']), courtController.updateCourt);
router.delete('/:courtId', authenticate, authorize(['ADMIN']), courtController.deleteCourt);
router.get('/', courtController.getAllCourts);
router.get('/:courtId', courtController.getCourtById);
router.post('/:courtId/timeslots', authenticate, authorize(['ADMIN']), courtController.createTimeSlot);
router.get('/:courtId/timeslots', courtController.getTimeSlots);

module.exports = router;