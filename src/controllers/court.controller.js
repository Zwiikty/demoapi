const prisma = require('../../prisma/client');
const dayjs = require('../utils/dayjs_th');
/*const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
*/

module.exports = (io) => {
    // --- ฟังก์ชันที่ใช้ Socket.IO ---
    const createCourt = async (req, res) => {
        const { name, location, pricePerHour } = req.body;
        try {
            const court = await prisma.court.create({
                data: { name, location, pricePerHour: parseFloat(pricePerHour) },
            });
            io.emit('court_created', court);
            res.status(201).json({ message: 'Court created', court });
        } catch (error) {
            res.status(400).json({ message: 'Create failed', error: error.message });
        }
    };

    const updateCourt = async (req, res) => {
        const { courtId } = req.params;
        const { name, location, pricePerHour } = req.body;
        try {
            const court = await prisma.court.update({
                where: { id: parseInt(courtId) },
                data: { name, location, pricePerHour: parseFloat(pricePerHour) },
            });
            io.emit('court_update', court);
            res.status(200).json({ message: 'Court updated', court });
        } catch (error) {
            res.status(400).json({ message: 'Update failed', error: error.message });
        }
    };

    const deleteCourt = async (req, res) => {
        const { courtId } = req.params;
        try {
            await prisma.courtTimeSlot.deleteMany({ where: { courtId: parseInt(courtId) } });
            await prisma.court.delete({ where: { id: parseInt(courtId)} });
            io.emit('court deleted', { courtId: parseInt(courtId) });
            res.status(200).json({ message: 'Court deleted' });
        } catch (error) {
            res.status(400).json({ message: 'Delete failed', error: error.message });
        }
    };

    const createTimeSlot = async (req, res) => {
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
            io.emit('timeslots_created', {
                courtId:    parsedCourtId,
                date,
                slots: slotsData
            });
            res.status(201).json({
                message: `Created ${slotsData.length} time slots`,
                slots: slotsData
            });
        } catch (error) {
            res.status(400).json({ message: "Failed to create time slots", error: error.message });
        }
    };

    const updateTimeSlotStatus = async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!["AVAILABLE", "UNAVAILABLE", "BOOKED", "MAINTENANCE"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        try {
            const updated = await prisma.courtTimeSlot.update({
                where: { id: parseInt(id) },
                data: { status }
            });
            io.emit('court_status_updated', {
                courtId: updated.courtId,
                timeSlotId: updated.id,
                newStatus: updated.status,
                time: updated.startTime,
            });
            res.json({ message: "Time slot status updated", timeSlot: updated });
        } catch (error) {
            res.status(400).json({ message: "Failed to update status", error: error.message });
        }
    };

    // --- ฟังก์ชันที่ไม่ใช้ Socket.IO ---
    const getAllCourts = async (req, res) => {
        try {
            const courts = await prisma.court.findMany();
            res.status(200).json(courts);
        } catch (error) {
            res.status(500).json({ message: 'Fetch failed', error: error.message });
        }
    };

    const getCourtById = async (req, res) => {
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

    const getCourtsWithStatuses = async (req, res) => {
        const { date, startTime, courtId } = req.query;
        if (!date || !startTime) {
            return res.status(400).json({ message: 'Missing date or startTime' });
        }

        try {
            const parseHour = (timeStr) => {
            const [hour, minute] = timeStr.split(':').map(Number);
            if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 24 || minute !== 0) {
                throw new Error('Invalid time format. Use HH:00 (e.g. 08:00)');
            }
            return hour;
            };

        const startHour = parseHour(startTime);
        const allTimeSlots = [];
        for (let hour = startHour; hour < 24; hour++) {
        const start = dayjs.tz(`${date} ${hour}:00`, 'Asia/Bangkok');
        const end = start.add(1, 'hour');
        allTimeSlots.push({
            start,
            end,
            startKey: start.format('HH:mm'),
            endKey: end.format('HH:mm')
        });
        }

        const courtIds = courtId
        ? courtId.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
        : null;

        const courts = await prisma.court.findMany({
        where: courtIds ? { id: { in: courtIds } } : undefined
        });

        if (courts.length === 0) {
        return res.status(404).json({ message: 'Court(s) not found' });
        }

        const startOfDay = dayjs.tz(`${date} 00:00`, 'Asia/Bangkok').toDate();
        const endOfDay = dayjs.tz(`${date} 23:59:59`, 'Asia/Bangkok').toDate();

        const [slotsFromDB, bookings] = await Promise.all([
        prisma.courtTimeSlot.findMany({
            where: {
            startTime: { gte: startOfDay, lte: endOfDay },
            ...(courtIds && { courtId: { in: courtIds } })
            },
            select: {
            courtId: true,
            startTime: true,
            status: true
            }
        }),
        prisma.booking.findMany({
            where: {
            date: { gte: startOfDay, lte: endOfDay },
            ...(courtIds && { courtId: { in: courtIds } })
            },
            include: {
            user: {
                select: {
                firstName: true,
                lastName: true
                }
            }
            }
        })
        ]);

        const slotMap = {};
        slotsFromDB.forEach(slot => {
        const key = `${slot.courtId}_${dayjs(slot.startTime).tz('Asia/Bangkok').format('HH:mm')}`;
        slotMap[key] = {
            status: slot.status,
            bookedBy: null
        };
        });

        bookings.forEach(booking => {
        const key = `${booking.courtId}_${dayjs(booking.startTime).tz('Asia/Bangkok').format('HH:mm')}`;
        if (slotMap[key] && slotMap[key].status === 'BOOKED') {
            const { firstName, lastName } = booking.user;
            slotMap[key].bookedBy = `${firstName} ${lastName}`;
        }
        });

        const result = courts.map(court => {
        const slots = allTimeSlots.map(slot => {
            const key = `${court.id}_${slot.startKey}`;
            const data = slotMap[key] || { status: 'CLOSE', bookedBy: null };
            return {
            startTime: slot.startKey,
            endTime: slot.endKey,
            status: data.status,
            bookedBy: data.bookedBy
            };
        });

        return {
            id: court.id,
            name: court.name,
            slots
        };
        });

        return res.status(200).json({ courts: result });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Fetch failed', error: error.message });
    }
    };

    const getTimeSlots = async (req, res) => {
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

    const courtToday = async (req, res) => {
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

    return {
        createCourt,
        updateCourt,
        deleteCourt,
        createTimeSlot,
        updateTimeSlotStatus,
        getAllCourts,
        getCourtById,
        getCourtsWithStatuses,
        getTimeSlots,
        courtToday,
    };
};
