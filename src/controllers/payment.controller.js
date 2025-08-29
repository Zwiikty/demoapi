const prisma = require('../../prisma/client');
const generatePayload  = require("promptpay-qr");
const QRCode = require("qrcode");



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


exports.getPaymentStatus = async (req, res) => {
  try {
    const bookingId = Number(req.query.bookingId || req.params.bookingId);
    if (!bookingId) return res.status(400).json({ message: 'Missing bookingId' });

    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        slipImage: true,
        paymentSlipAmount: true,
        paymentVerified: true,
        paymentConfirmedAt: true
      }
    });
    if (!b) return res.status(404).json({ message: 'Booking not found' });

    res.json({
      bookingId: b.id,
      slipImage: b.slipImage,
      amount: b.paymentSlipAmount,
      verified: b.paymentVerified,
      confirmedAt: b.paymentConfirmedAt
    });
  } catch (e) {
    console.error('[getPaymentStatus] error:', e);
    res.status(500).json({ message: 'Failed', error: e.message });
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


