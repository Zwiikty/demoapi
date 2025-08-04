const prisma = require('../../prisma/client');
const generatePayload  = require("promptpay-qr");
const QRCode = require("qrcode");
const Tesseract = require('tesseract.js');
const path = require('path');


exports.generatePromptPayQR = async (req, res) => {
    const { phoneNumber, amount} = req.body;
    if (!phoneNumber || !amount) {
        return res.status(400).json({ message: 'Missing data'});
    }

    try {
        const payload = generatePayload(phoneNumber, { 
            amount: parseFloat(amount)
        });
        QRCode.toDataURL(payload, async (error, qrImage) => {
        if (error) {
            return res.status(500).json({ message: 'QR generation failed', error: error.message});
        }     
        res.status(200).json({ message: 'QR Code generated successfully',
                qrImage
            });
        }) ;
    } catch (error) {
        res.status(500).json({ message: 'QR generation failed', error: error.message });
    }
};

exports.readAmountFromSlip = async (req, res) => {
    const { imagePath, bookingId } = req.body;
    const fullPath = path.join(__dirname, '../uploads/slips/', imagePath);
    try {
        const result = await Tesseract.recognize(fullPath, 'eng', { 
            logger: m => console.log(m) 
        });
        const text = result.data.text;
        const matches = text.match(/\d+\.\d{2}/g);
        const amount = matches ? Math.max(...matches.map(m => parseFloat(m))) : null;
        if (!amount) return res.status(400).json({ message: 'Amount not found' });
        
        const booking = await prisma.booking.findUnique({
            where: { id: parseInt(bookingId) },
            include: { court: true },
        });
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        const durationHours = (new Date(booking.endTime) - new Date(booking.startTime)) / (1000 * 60 * 60);
        const expectedAmount = booking.court.pricePerHour * durationHours;

        const updateBooking = await prisma.booking.update({
            where: { id: booking.id },
            data: {
                paymentSlipAmount: amount,
                paymentVerified: false,
                paymentConfirmedAt: null,
            },
        });

        res.status(200).json({ 
            amount, 
            expectedAmount, 
            booking, 
            updateBooking,
            message: 'Amount read from slip and saved. Awaiting admin verification.'
        });
    } catch (error) {
        res.status(500).json({ message: 'OCR failed', error: error.message });
    }
};

exports.adminVerifyPayment = async (req, res) => {
    const { bookingId } = req.body;

    try {
        const booking = await prisma.booking.update({
            where: { id: parseInt(bookingId) },
            data: {
                status: 'APPROVE',
                paymentVerified: true,
                paymentConfirmedAt: new Date(),
            },
            include: { court: true }
        });

        const bookingTimeSlots = await prisma.bookingTimeSlot.findMany({
            where: { bookingId: booking.id },
            include: { courtTimeSlot: true }
        });

        const updatePromises = bookingTimeSlots.map(slot =>
            prisma.courtTimeSlot.update({
                where: { id: slot.courtTimeSlotId },
                data: { status: 'BOOKED' }
            })
        );

        await Promise.all(updatePromises);
        const io = req.app.get('io');
        io.to(`user_${booking.userId}`).emit('payment-approved', {
            bookingId: booking.id,
            courtName: booking.court.name,
            status: booking.status,
            startTime: booking.startTime,
            endTime: booking.endTime
        });

        res.status(200).json({ message: 'Payment verified and time slots booked', booking });

    } catch (error) {
        res.status(500).json({ message: 'Verification failed', error: error.message });
    }
};


exports.adminRejectedPayment = async (req, res) => {
    const { bookingId } = req.body;

    try {
        const booking = await prisma.booking.update({
            where: { id: parseInt(bookingId) },
            data: {
                status: 'REJECTED',
                paymentVerified: false,
                paymentConfirmedAt: null,
            },
            include: { court: true }
        });

        const bookingTimeSlots = await prisma.bookingTimeSlot.findMany({
            where: { bookingId: booking.id },
            include: { courtTimeSlot: true }
        });

        const updatePromises = bookingTimeSlots.map(slot =>
            prisma.courtTimeSlot.update({
                where: { id: slot.courtTimeSlotId },
                data: { status: 'AVAILABLE' }
            })
        );

        await Promise.all(updatePromises);
        const io = req.app.get('io');
        io.to(`user_${booking.userId}`).emit('payment-reject', {
        bookingId: booking.id,
        courtName: booking.court.name,
        status: booking.status,
        reason: reason || 'Slip verification failed',
        startTime: booking.startTime,
        endTime: booking.endTime
        });

        res.status(200).json({ message: 'Payment rejected and time slots released', booking });

    } catch (error) {
        res.status(500).json({ message: 'Rejection failed', error: error.message });
    }
};


