const prisma = require('../../prisma/client');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

exports.createCourt = async (req, res) => {
    const { name, location, pricePerHour } = req.body;
    try {
        const court = await prisma.court.create({
            data: { name, location, pricePerHour: parseFloat(pricePerHour) },
        });
        res.status(201).json({ message: 'Court created', court });
    } catch (error) {
        res.status(400).json({ message: 'Create failed', error: error.message });
    }
};

exports.updateCourt = async (req, res) => {
    const { courtId } = req.params;
    const { name, location, pricePerHour } = req.body;
    try {
        const court = await prisma.court.update({
            where: { id: parseInt(courtId) },
            data: { name, location, pricePerHour: parseFloat(pricePerHour) },
        });
        res.status(200).json({ message: 'Court updated', court });
    } catch (error) {
        res.status(400).json({ message: 'Update failed', error: error.message });
    }
};

exports.deleteCourt = async (req, res) => {
    const { courtId } = req.params;
    try {
        await prisma.courtTimeSlot.deleteMany({ where: { courtId: parseInt(courtId) } });
        await prisma.court.delete({ where: { id: parseInt(courtId)} });
        res.status(200).json({ message: 'Court deleted' });
    } catch (error) {
        res.status(400).json({ message: 'Delete failed', error: error.message });
    }
};

exports.getAllCourts = async (req, res) => {
    try {
        const courts = await prisma.court.findMany();
        res.status(200).json(courts);
    } catch (error) {
        res.status(500).json({ message: 'Fetch failed', error: error.message });
    }
};

exports.getCourtById = async (req, res) => {
    const { courtId } = req.params;
    try {
        const court = await prisma.court.findUnique({
            where: { id: parseInt(courtId) },
        });
        res.status(200).json(court);
    } catch (error) {
        res.status(400).json({ message: 'Fetch failed', error: error.message });
    }
};

exports.getCourtsWithStatuses = async (req, res) => {
    const { date, startTime } = req.query;

    if (!date || !startTime) {
        return res.status(400).json({ message: 'Missing date or startTime' });
    }

    try {
        const selectedDate = new Date(`${date}T00:00:00`);
        if (isNaN(selectedDate.getTime())) {
            return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
        }

        const [hour, minute] = startTime.split('.').map(Number);
        if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return res.status(400).json({ message: 'Invalid startTime format. Use HH.MM' });
        }
        const queryStartDateTime = new Date(selectedDate);
        queryStartDateTime.setHours(hour, minute || 0, 0, 0);
        const queryEndDateTime = new Date(selectedDate);
        queryEndDateTime.setDate(selectedDate.getDate() + 1);
        const courts = await prisma.court.findMany();

        const slotsFromDB = await prisma.courtTimeSlot.findMany({
            where: {
                startTime: {
                    gte: queryStartDateTime,
                    lt: queryEndDateTime
                }
            },
            select: {
                courtId: true,
                startTime: true,
                endTime: true,
                status: true
            },
            orderBy: {
                startTime: 'asc'
            }
        });

        const slotsByCourt = {};
        slotsFromDB.forEach(slot => {
            const courtId = slot.courtId;
            if (!slotsByCourt[courtId]) {
                slotsByCourt[courtId] = [];
            }
            const slotStartTimeFormatted = new Date(slot.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const slotEndTimeFormatted = new Date(slot.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            slotsByCourt[courtId].push({
                startTime: slotStartTimeFormatted,
                endTime: slotEndTimeFormatted,
                status: slot.status
            });
        });

        const result = courts.map(court => ({
            id: court.id,
            name: court.name,
            slots: slotsByCourt[court.id] || []
        }));

        return res.status(200).json({ courts: result });
    } catch (error) {
        console.error("Error in getCourtsWithStatuses:", error);
        return res.status(500).json({ message: 'Fetch failed', error: error.message });
    }
};





exports.createTimeSlot = async (req, res) => {
  const { courtId } = req.params;
  const { date, startHour, endHour } = req.body;

  const parsedCourtId = parseInt(courtId);
  if (isNaN(parsedCourtId)) {
    return res.status(400).json({ message: "Invalid courtId" });
  }

  if (!date) {
    return res.status(400).json({ message: "date is required" });
  }

  if (startHour >= endHour) {
    return res.status(400).json({ message: "startHour must be less than endHour" });
  }

  try {
    const startOfDay = dayjs.tz(`${date} 00:00`, "Asia/Bangkok").toDate();
    const endOfDay = dayjs.tz(`${date} 23:59:59`, "Asia/Bangkok").toDate();
//check timeslot
    const existing = await prisma.courtTimeSlot.findFirst({
      where: {
        courtId: parsedCourtId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    if (existing) {
      return res.status(400).json({
        message: `Time slots for court ${parsedCourtId} on ${date} already exist`
      });
    }

    const slotsData = [];

    for (let hour = startHour; hour < endHour; hour++) {
      slotsData.push({
        courtId: parsedCourtId,
        startTime: dayjs.tz(`${date} ${hour}:00`, "Asia/Bangkok").toDate(),
        endTime: dayjs.tz(`${date} ${hour + 1}:00`, "Asia/Bangkok").toDate(),
        status: "AVAILABLE"
      });
    }

    await prisma.$transaction([
      prisma.courtTimeSlot.createMany({ data: slotsData })
    ]);

    res.status(201).json({
      message: `Created ${slotsData.length} time slots`,
      slots: slotsData
    });
  } catch (error) {
    res.status(400).json({ message: "Failed to create time slots", error: error.message });
  }
};

exports.getTimeSlots = async (req, res) => {
    const { courtId } = req.params;
    try {
        const timeSlots = await prisma.courtTimeSlot.findMany({
            where: { courtId: parseInt(courtId) },
        });
        res.status(200).json(timeSlots);
    } catch (error) {
        res.status(500).json({ message: 'Fetch failed', error: error.message });
    }
};

exports.updateTimeSlotStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!["AVAILABLE", "BOOKED", "MAINTENANCE"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    try {
        const updated = await prisma.courtTimeSlot.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        res.json({ message: "Time slot status updated", timeSlot: updated });
    } catch (error) {
        res.status(400).json({ message: "Failed to update status", error: error.message });
    }
};

exports.courtToday = async (req, res) => {
    const { date, courtId } = req.query;

    if (!date || !courtId) {
        return res.status(400).json({ message: 'Missing date or courtId' });
    }

    try {
        const selectedDate = new Date(date);
        if (isNaN(selectedDate.getTime())) {
            return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
        }

        const court = await prisma.court.findUnique({
            where: { id: parseInt(courtId) }
        });

        if (!court) {
            return res.status(404).json({ message: 'Court not found' });
        }

        const slots = await prisma.courtTimeSlot.findMany({
            where: {
                courtId: parseInt(courtId),
                startTime: {
                    gte: new Date(`${date}T00:00:00`),
                    lt: new Date(`${date}T23:59:59`)
                }
            },
            orderBy: { startTime: 'asc' },
            select: {
                startTime: true,
                endTime: true,
                status: true
            }
        });

        const formattedSlots = slots.map(slot => ({
            startTime: slot.startTime.toTimeString().slice(0, 5),
            endTime: slot.endTime.toTimeString().slice(0, 5),
            status: slot.status
        }));

        return res.status(200).json({
            court: {
                id: court.id,
                name: court.name,
                slots: formattedSlots
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Fetch failed', error: error.message });
    }
};