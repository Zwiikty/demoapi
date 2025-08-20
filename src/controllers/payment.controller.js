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

// polyfill fetch สำหรับ Node < 18
const _fetch = global.fetch || ((...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args))
);

exports.readAmountFromSlip = async (req, res) => {
  const { imagePath, bookingId } = req.body;

  try {
    // โหลดรูปจาก static URL บน Railway (อย่าดึงจากไฟล์ระบบ)
    const fileUrl = `${req.protocol}://${req.get('host')}/slips/${imagePath}`;
    const resp = await _fetch(fileUrl);
    if (!resp.ok) {
      return res.status(400).json({ message: 'Cannot fetch slip image', url: fileUrl });
    }
    const buffer = Buffer.from(await resp.arrayBuffer());

    // OCR ด้วย eng ตามสูตรเดิม (แม่นสุดกับสลิปของคุณ)
    const result = await Tesseract.recognize(buffer, 'eng', {
      logger: m => console.log(m)
    });

    const text = result.data.text || '';
    // ดึงจำนวนเงินรูปแบบ 1234.56 แล้วเอาค่าสูงสุด (ตามเดิม)
    const matches = text.match(/\d+\.\d{2}/g);
    const amount = matches ? Math.max(...matches.map(m => parseFloat(m))) : null;
    if (!amount) {
      return res.status(400).json({ message: 'Amount not found', ocrText: text });
    }

    // ดึง booking + court เพื่อคำนวณ expectedAmount
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(bookingId) },
      include: { court: true },
    });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

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
      message: 'Amount read from slip via URL and saved. Awaiting admin verification.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'OCR failed', error: error.message });
  }
};

exports.adminVerifyPayment = async (req, res) => {
  const { bookingId } = req.body;

  try {
    const { booking, pointsGranted } = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.update({
        where: { id: parseInt(bookingId) },
        data: {
          status: 'APPROVE',
          paymentVerified: true,
          paymentConfirmedAt: new Date(),
        },
        include: { court: true },
      });
      const bookingTimeSlots = await tx.bookingTimeSlot.findMany({
        where: { bookingId: booking.id },
        select: { courtTimeSlotId: true },
      });

      const slotIds = bookingTimeSlots.map(s => s.courtTimeSlotId);
      if (slotIds.length > 0) {
        await tx.courtTimeSlot.updateMany({
          where: { id: { in: slotIds } },
          data: { status: 'BOOKED' },
        });
      }

      const points = bookingTimeSlots.length;
      const existingLedger = await tx.pointLedger.findUnique({
        where: { bookingId: booking.id },
      });

      if (!existingLedger && points > 0) {
        await tx.pointLedger.create({
          data: {
            userId: booking.userId,
            bookingId: booking.id,
            points,
            reason: 'Booking approved',
          },
        });
        await tx.user.update({
          where: { id: booking.userId },
          data: { points: { increment: points } },
        });
      }

      return { booking, pointsGranted: existingLedger ? 0 : points };
    });

    const io = req.app.get('io');
    io.to(`user_${booking.userId}`).emit('payment-approved', {
      bookingId: booking.id,
      courtName: booking.court.name,
      status: booking.status,
      startTime: booking.startTime,
      endTime: booking.endTime,
      pointsAdded: pointsGranted,
    });

    res.status(200).json({
      message: 'Payment verified, time slots booked, points granted (idempotent).',
      booking,
      pointsGranted,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
};

exports.adminRejectedPayment = async (req, res) => {
  const { bookingId, reason } = req.body;

  try {
    const { booking, pointsReverted } = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.update({
        where: { id: parseInt(bookingId) },
        data: {
          status: 'REJECTED',
          paymentVerified: false,
          paymentConfirmedAt: null,
        },
        include: { court: true },
      });
      const bookingTimeSlots = await tx.bookingTimeSlot.findMany({
        where: { bookingId: booking.id },
        select: { courtTimeSlotId: true },
      });
      const slotIds = bookingTimeSlots.map(s => s.courtTimeSlotId);
      if (slotIds.length > 0) {
        await tx.courtTimeSlot.updateMany({
          where: { id: { in: slotIds } },
          data: { status: 'AVAILABLE' },
        });
      }

      const ledger = await tx.pointLedger.findUnique({
        where: { bookingId: booking.id },
      });

      let reverted = 0;
      if (ledger) {
        reverted = ledger.points;

        const user = await tx.user.findUnique({
          where: { id: booking.userId },
          select: { points: true },
        });

        const decrementBy = Math.min(user.points, ledger.points);

        await tx.pointLedger.delete({ where: { id: ledger.id } });
        await tx.user.update({
          where: { id: booking.userId },
          data: { points: { decrement: decrementBy } },
        });
      }

      return { booking, pointsReverted: reverted };
    });

    const io = req.app.get('io');
    io.to(`user_${booking.userId}`).emit('payment-reject', {
      bookingId: booking.id,
      courtName: booking.court.name,
      status: booking.status,
      reason: reason || 'Slip verification failed',
      startTime: booking.startTime,
      endTime: booking.endTime,
      pointsReverted,
    });

    res.status(200).json({
      message: 'Payment rejected, time slots released, points reverted if existed.',
      booking,
      pointsReverted,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Rejection failed', error: error.message });
  }
};


