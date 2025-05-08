const prisma = require('../../prisma/client');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

exports.createBooking = async (req, res) => {
    const { courtId, date, startTime, endTime } = req.body;
    const userId = req.user.id;
    const startDateTime = dayjs.tz(`${date}T${startTime}`, 'Asia/Bangkok').toDate();
    const endDateTime = dayjs.tz(`${date}T${endTime}`, 'Asia/Bangkok').toDate();

    if (startDateTime >= endDateTime) {
        return res.status(400).json({ message: 'Start time must be before end time' });
    }

    try {
        const overlappingBooking = await prisma.booking.findFirst({
            where: {
                courtId: parseInt(courtId),
                date: new Date(date),
                OR: [{
                    startTime: { lt: endDateTime },
                    endTime: { gt: startDateTime },
                }]
            }
        });
        if (overlappingBooking) {
            return res.status(400).json({ message: 'This time slot is already booked'});
        }
        const booking = await prisma.booking.create ({
            data: {
                userId,
                courtId,
                date: new Date(date),
                startTime: startDateTime,
                endTime: endDateTime,
            }
        });
        res.status(201).json({ message: 'Booking crated', booking });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.uploadSlip = async (req, res) => {
    const { bookingId } = req.params;
    const slipImage = req.file?.filename;
    if (!slipImage) {
        return res.status(400).json({ message: 'No slip image provided' });
    }
    try {
        const booking = await prisma.booking.update({
            where: { id: parseInt(bookingId)},
            data: {
                slipImage,
                status: 'PENDING',
            },
        });
        res.status(200).json({ message: 'Slip uploaded', booking });
    } catch (error) {
        res.status(400).json({ message: 'Upload failed', error: error.message });
    }
};

exports.getMyBookings = async (req, res) => {
    const userId = req.user.id;
    try {
        const bookings = await prisma.booking.findMany({
            where: { userId },
            include: { court: true },
            orderBy: { date: 'desc' }
        });
        res.status(200).json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch bookings', error: error.message });
    }
};

exports.updateStatus = async (req, res) => {
    const { bookingId } = req.params;
    const { status } = req.body;
    if (!['APPROVE', 'REJECTED'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }
    try {
        const booking = await prisma.booking.update({
            where: { id: parseInt(bookingId) },
            data: { status },
        });
        res.status(200).json({ message: `Booking ${status.toLowerCase()}`, booking });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update status', error: error.message });
    }
};

exports.rescheduleBooking = async (req, res) => {
    const { bookingId } = req.params;
    const { date, startTime, endTime } = req.body;
    const userId = req.user.id;
    
    const oldBooking = await prisma.booking.findUnique({
        where: { id: parseInt(bookingId) },
        include: { rescheduledTo: true },
    });
    if (!oldBooking || oldBooking.userId !== userId) {
        return res.status(404).json({ message: 'Booking not found or unauthorize' });
    }
    if (oldBooking.rescheduledTo.length > 0) {
        return res.status(400).json({ message: 'You can only rescheduled once per booking' });
    }
    
    const now = dayjs().tz('Asia/Bangkok');
    const oldStart = dayjs(oldBooking.startTime).tz('Asia/Bangkok');
    const timeDiff = oldStart.diff(now, 'hour', true);
    if (timeDiff < 3 || timeDiff > 6) {
        return res.status(400).json({ message: 'Reschedule must be 3-6 hour before the original booking'});
    }

    const newStart = dayjs.tz(`${date}T${startTime}`, 'Asia/Bangkok').toDate();
    const newEnd = dayjs.tz(`${date}T${endTime}`, 'Asia/Bangkok').toDate();
    const overlap = await prisma.booking.findFirst({
        where: {
            courtId: oldBooking.courtId,
            date: new Date(date),
            OR: [{
                startTime: { lt: newEnd },
                endTime: { gt: newStart },
            }]
        }
    });
    if (overlap) {
        return res.status(400).json({ message: 'Time slot already booked' });
    }

    const newBooking = await prisma.booking.create({
        data: {
            userId,
            courtId: oldBooking.courtId,
            date: new Date(date),
            startTime: newStart,
            endTime: newEnd,
            rescheduledFromId: oldBooking.id,
        }
    });
    res.status(201).json({ message: 'Booking rescheduled', newBooking });
}

exports.getAllBookings = async (req, res) => {
    try {
        const bookings = await prisma.booking.findMany({
            include: { user: true, court: true },
            orderBy: { date: 'desc' }
        });
        res.status(200).json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch all bookings', error: error.message });
    }
};

exports.adminCancelBooking = async (req, res) => {
    const { bookingId } = req.params;
    try {
        await prisma.booking.delete({ where: { id: parseInt(bookingId) } });
        res.status(200).json({ message: 'Booking canceled' });
    } catch (error) {
        res.status(500).json({ message: 'Cancel failed', error: error.message });
    }
};