const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth.middleware');

module.exports = (io) => {
    const courtController = require('../controllers/court.controller')(io);
    router.post('/', authenticate, authorize(['ADMIN']), courtController.createCourt);
    router.get('/available', courtController.getCourtsWithStatuses);
    router.get('/today', courtController.courtToday);
    router.put('/:courtId', authenticate, authorize(['ADMIN']), courtController.updateCourt);
    router.delete('/:courtId', authenticate, authorize(['ADMIN']), courtController.deleteCourt);
    router.get('/', courtController.getAllCourts);
    router.get('/:courtId', courtController.getCourtById);
    router.post('/:courtId/timeslots', authenticate, authorize(['ADMIN']), courtController.createTimeSlot);
    router.get('/:courtId/timeslots', courtController.getTimeSlots);
    router.patch('/timeslots/:id/status', courtController.updateTimeSlotStatus);
    return  router;
};

