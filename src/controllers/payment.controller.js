const prisma = require('../../prisma/client');
const generatePayload  = require("promptpay-qr");
const QRCode = require("qrcode");
const { notifyUser } = require('../utils/notify');

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
  const id = Number(bookingId);
  if (!id) return res.status(400).json({ message: 'Missing bookingId' });

  try {
    // ✅ guard: รับเฉพาะ PENDING -> APPROVE
    const current = await prisma.booking.findUnique({
      where: { id },
      select: { status: true }
    });
    if (!current) return res.status(404).json({ message: 'Booking not found' });
    if (current.status !== 'PENDING') {
      return res.status(409).json({ message: 'Invalid state: only PENDING can be APPROVED' });
    }

    const { booking, pointsGranted } = await prisma.$transaction(async (tx) => {
      // updateWithGuard
      const res = await tx.booking.updateMany({
        where: { id, status: 'PENDING' },
        data: {
            status: 'APPROVE',
            paymentVerified: true,
            paymentConfirmedAt: new Date(),
        },
      });
      if (res.count === 0) {
        throw new Error('Invalid state: only PENDING can be APPROVED');
      }

      const updated = await tx.booking.findUnique({
        where: { id },
        include: { court: true },
      });

          // time slots -> BOOKED
          const bookingTimeSlots = await tx.bookingTimeSlot.findMany({
            where: { bookingId: updated.id },
            select: { courtTimeSlotId: true },
          });
          const slotIds = bookingTimeSlots.map(s => s.courtTimeSlotId);
          if (slotIds.length > 0) {
            await tx.courtTimeSlot.updateMany({
              where: { id: { in: slotIds } },
              data: { status: 'BOOKED' },
            });
          }

          // points (idempotent by unique bookingId on ledger)
          const points = bookingTimeSlots.length;
          const existingLedger = await tx.pointLedger.findUnique({
            where: { bookingId: updated.id },
          });
          if (!existingLedger && points > 0) {
            await tx.pointLedger.create({
              data: {
                userId: updated.userId,
                bookingId: updated.id,
                points,
                reason: 'Booking approved',
              },
            });
            await tx.user.update({
              where: { id: updated.userId },
              data: { points: { increment: points } },
            });
          }

          return { booking: updated, pointsGranted: existingLedger ? 0 : points };
        });

    // 🔔 แจ้งลูกค้า: Socket + FCM
    const io = req.app.get('io');
    await notifyUser(
      io,
      booking.userId,
      'payment-approved',
      {
        bookingId: booking.id,
        courtName: booking.court.name,
        status: booking.status,
        startTime: booking.startTime,
        endTime: booking.endTime,
        pointsAdded: pointsGranted,
      },
      {
        notification: {
          title: 'ชำระเงินได้รับการอนุมัติ',
          body: `การจองสนาม ${booking.court.name} อนุมัติเรียบร้อย`,
        },
        data: {
          type: 'payment-approved',
          bookingId: String(booking.id),
          status: booking.status,
          courtName: booking.court.name,
          startTime: booking.startTime.toISOString(),
          endTime: booking.endTime.toISOString(),
          pointsAdded: String(pointsGranted || 0),
        },
      }
    );

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
  const id = Number(bookingId);
  if (!id) return res.status(400).json({ message: 'Missing bookingId' });

  try {
    // ✅ guard: รับเฉพาะ PENDING -> REJECTED
    const current = await prisma.booking.findUnique({
      where: { id },
      select: { status: true }
    });
    if (!current) return res.status(404).json({ message: 'Booking not found' });
    if (current.status !== 'PENDING') {
      return res.status(409).json({ message: 'Invalid state: only PENDING can be REJECTED' });
    }

    const { booking, pointsReverted } = await prisma.$transaction(async (tx) => {
      // อัปเดต Booking → REJECTED
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'REJECTED',
          paymentVerified: false,
          paymentConfirmedAt: null,
        },
        include: { court: true },
      });

      // ดึง courtTimeSlot ที่เกี่ยวข้อง
      const bookingTimeSlots = await tx.bookingTimeSlot.findMany({
        where: { bookingId: updated.id },
        select: { courtTimeSlotId: true },
      });
      const slotIds = bookingTimeSlots.map(s => s.courtTimeSlotId);

      if (slotIds.length > 0) {
        // ✅ ปล่อย slot ให้ AVAILABLE
        await tx.courtTimeSlot.updateMany({
          where: { id: { in: slotIds } },
          data: { status: 'AVAILABLE' },
        });

        // ✅ ลบ mapping ออกจาก BookingTimeSlot
        await tx.bookingTimeSlot.deleteMany({
          where: { bookingId: updated.id }
        });
      }

      // ✅ คืนแต้ม (ถ้ามี)
      const ledger = await tx.pointLedger.findUnique({
        where: { bookingId: updated.id },
      });

      let reverted = 0;
      if (ledger) {
        reverted = ledger.points;
        const user = await tx.user.findUnique({
          where: { id: updated.userId },
          select: { points: true },
        });
        const decrementBy = Math.min(user.points, ledger.points);

        await tx.pointLedger.delete({ where: { id: ledger.id } });
        await tx.user.update({
          where: { id: updated.userId },
          data: { points: { decrement: decrementBy } },
        });
      }

      return { booking: updated, pointsReverted: reverted };
    });

    // 🔔 แจ้งลูกค้า
    const io = req.app.get('io');
    await notifyUser(
      io,
      booking.userId,
      'payment-reject',
      {
        bookingId: booking.id,
        courtName: booking.court.name,
        status: booking.status,
        reason: reason || 'Slip verification failed',
        startTime: booking.startTime,
        endTime: booking.endTime,
        pointsReverted,
      },
      {
        notification: {
          title: 'ชำระเงินถูกปฏิเสธ',
          body: reason ? reason : 'ไม่ผ่านการตรวจสอบสลิป',
        },
        data: {
          type: 'payment-reject',
          bookingId: String(booking.id),
          status: booking.status,
          courtName: booking.court.name,
          reason: String(reason || 'Slip verification failed'),
          startTime: booking.startTime.toISOString(),
          endTime: booking.endTime.toISOString(),
          pointsReverted: String(pointsReverted || 0),
        },
      }
    );

    res.status(200).json({
      message: 'Payment rejected, time slots released, bookingTimeSlot cleared, points reverted if existed.',
      booking,
      pointsReverted,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Rejection failed', error: error.message });
  }
};