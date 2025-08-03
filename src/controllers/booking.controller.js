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
        const matchingTimeSlots = await prisma.courtTimeSlot.findMany({
            where: {
                courtId: parseInt(courtId),
                startTime: { gte: startDateTime },
                endTime: { lte: endDateTime },
            }
        });
        if (matchingTimeSlots.length === 0) {
            return res.status(400).json({ message: 'No available time slots for this range' });
        }
        const slotIds = matchingTimeSlots.map(slot => slot.id);
        const bookedSlots = await prisma.bookingTimeSlot.findFirst({
            where: {
                courtTimeSlotId: { in: slotIds }
            }
        });
        if (bookedSlots) {
            return res.status(400).json({ message: 'Some of the selected time slots are already booked' });
        }
        const booking = await prisma.booking.create({
            data: {
                userId,
                courtId: parseInt(courtId),
                date: new Date(date),
                startTime: startDateTime,
                endTime: endDateTime,
            }
        });
        await prisma.bookingTimeSlot.createMany({
            data: slotIds.map(id => ({
                bookingId: booking.id,
                courtTimeSlotId: id
            }))
        });

        res.status(201).json({ message: 'Booking created successfully', booking });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Booking failed', error: error.message });
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
        include: {
            court: {
            select: {
                name: true,
                location: true,
                pricePerHour: true
            }
            },
            bookingTimeSlots: {
            select: {
                courtTimeSlot: {
                select: {
                    startTime: true,
                    endTime: true
                }
                }
            }
            }
        },
        orderBy: {
            date: 'desc'
        }
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
            include: { user: {
                select: {
                    firstName: true,
                    lastName: true
                    }
                } 
            },
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

