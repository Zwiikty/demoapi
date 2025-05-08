const prisma = require('../../prisma/client');

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

exports.createTimeSlot = async (req, res) => {
    const { courtId } = req.params;
    const { startTime, endTime } = req.body;
    const parsedCourtId = parseInt(courtId);
    if (isNaN(parsedCourtId)) {
        return res.status(400).json({ message: 'Invalid courtId' });
    }
    try {
        const timeSlot = await prisma.courtTimeSlot.create({
            data: {
                courtId: parsedCourtId,
                startTime: new Date(`2025-01-01T${startTime}:00Z`),
                endTime: new Date(`2025-01-01T${endTime}:00Z`),
            },
        });
        res.status(201).json({ message: 'Time slot created', timeSlot });
    } catch (error) {
        res.status(400).json({ message: 'Time slot failed', error: error.message });
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