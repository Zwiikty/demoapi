const prisma = require('../../prisma/client');
const dayjs = require('../utils/dayjs_th');

exports.createWalkInBooking = async (req, res) => {
  const { courtId, date, startTime, endTime, fullName, people } = req.body;

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
      return res.status(400).json({ message: 'Some of the selected time slots are already booked or unavailable' });
    }

    const walkInBooking = await prisma.walkInBooking.create({
        data: {
        courtId: parseInt(courtId),
        fullName,
        people,
        date: new Date(date),
        startTime: startDateTime,
        endTime: endDateTime,
        }
    });

    await prisma.bookingTimeSlot.createMany({
        data: slotIds.map(id => ({
            walkInBookingId: walkInBooking.id,
            courtTimeSlotId: id
        }))
    });

    await prisma.courtTimeSlot.updateMany({
        where: {
            id: { in: slotIds }
        },
        data: {
            status: 'BOOKED'
        }
    });

    res.status(201).json({ message: 'Walk-in booking created successfully', walkInBooking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Walk-in booking failed', error: error.message });
  }
};
