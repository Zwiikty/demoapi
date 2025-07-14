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
    const { date, startTime, endTime } = req.query;

    if (!date || !startTime || !endTime) {
        return res.status(400).json({ message: 'Missing date, startTime, or endTime' });
    }

    try {
        const formattedStartTime = startTime.replace('.', ':');
        const formattedEndTime = endTime.replace('.', ':');
        const startDateTime = new Date(`${date}T${formattedStartTime}`);
        const endDateTime = new Date(`${date}T${formattedEndTime}`);

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            return res.status(400).json({ message: 'Invalid date or time format provided. Please use HH.MM or HH:MM.' });
        }

        const allCourts = await prisma.court.findMany();
        const overlappingSlots = await prisma.courtTimeSlot.findMany({
            where: {
                startTime: { lt: endDateTime },
                endTime: { gt: startDateTime },
            },
            select: {
                courtId: true,
                status: true,
            },
        });

        const busyCourtsMap = new Map();
        overlappingSlots.forEach(slot => {
            if (!busyCourtsMap.has(slot.courtId)) {
                busyCourtsMap.set(slot.courtId, []);
            }
            busyCourtsMap.get(slot.courtId).push(slot.status);
        });

        const result = allCourts.map(court => {
            const statuses = busyCourtsMap.get(court.id) || [];
            return {
                id: court.id,
                name: court.name,
                available: statuses,
            };
        });

        return res.status(200).json({ courts: result });
    } catch (error) {
        console.error(error);
        return res.status(400).json({ message: 'Fetch failed', error: error.message });
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
