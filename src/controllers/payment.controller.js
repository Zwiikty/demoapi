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

// ใช้ fetch ได้ทั้ง Node18+ และ node-fetch fallback
const _fetch = global.fetch || ((...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args))
);

// แปลงเลขไทย -> อารบิก (กันกรณีสลิปบางธนาคารใช้เลขไทย)
const thaiDigitsToArabic = (s) =>
  s.replace(/[๐๑๒๓๔๕๖๗๘๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d));

exports.readAmountFromSlip = async (req, res) => {
  const { imagePath, bookingId } = req.body;

  try {
    // --- สร้าง URL ของไฟล์สลิปที่เสิร์ฟโดย static ---
    const fileUrl = `${req.protocol}://${req.get('host')}/slips/${imagePath}`;
    console.log('OCR File URL:', fileUrl);

    // --- โหลดภาพเป็น buffer ---
    const response = await _fetch(fileUrl);
    if (!response.ok) {
      return res.status(400).json({ message: 'Cannot fetch slip image' });
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // --- OCR ---
    const result = await Tesseract.recognize(buffer, 'eng+tha', {
      logger: (m) => console.log(m),
    });

    // --- เตรียมข้อความสำหรับจับจำนวนเงิน ---
    let text = result?.data?.text || '';
    console.log('RAW OCR Text:', text);

    // ปรับแก้ข้อความ: แปลงเลขไทย, ตัดเว้นวรรคเกิน, normalize
    text = thaiDigitsToArabic(text)
      .replace(/[Oo]/g, '0')    // กัน OCR อ่าน O เป็นศูนย์
      .replace(/[,]/g, ',')     // ให้ comma เป็น comma จริง ๆ
      .replace(/\s+\n/g, '\n')
      .replace(/\n+/g, '\n');

    // --- ดึง booking เพื่อคำนวณ expectedAmount ไว้ใช้เลือกตัวเลขที่เหมาะสม ---
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(bookingId) },
      include: { court: true },
    });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    const durationHours =
      (new Date(booking.endTime) - new Date(booking.startTime)) / (1000 * 60 * 60);
    const expectedAmount = booking.court.pricePerHour * durationHours;

    // --- สร้างชุด regex ที่ “ให้ความสำคัญก่อน”: ยอด/จำนวน/Total/THB ฯลฯ ---
    // รูปแบบ: [label] [ตัวคั่น] [ตัวเลข]
    const keywordRegexes = [
      // ไทย & อังกฤษ ที่พบบ่อย
      /(ยอด(?:ชำระ|รวม)?|รวม|จำนวนเงิน|จำนวน|ชำระ|ยอดสุทธิ|ยอดชำระสุทธิ|Amount|Total|Paid|Grand\s*Total|THB)\s*[:=]?\s*([0-9.,]{1,15})/i,
      // THB นำหน้า
      /(THB)\s*[:=]?\s*([0-9.,]{1,15})/i,
      // เลขตามด้วยหน่วย
      /([0-9.,]{1,15})\s*(บาท|THB)/i,
    ];

    // เก็บ candidate ทั้งจากคีย์เวิร์ด และ “เลขทั้งหมด” ในสลิป
    const candidates = [];

    // 1) จากคีย์เวิร์ด (น้ำหนักสูง)
    for (const rgx of keywordRegexes) {
      const lines = text.split('\n');
      for (const line of lines) {
        const m = line.match(rgx);
        if (m) {
          const rawNum = (m[2] || m[1] || '').toString().trim();
          if (!rawNum) continue;
          // ลบ comma แล้ว parse
          const val = parseFloat(rawNum.replace(/,/g, ''));
          if (Number.isFinite(val)) {
            candidates.push({ val, source: 'keyword', line });
          }
        }
      }
    }

    // 2) fallback: เลขทุกตัวที่ดูเหมือนจำนวนเงิน (เช่น 68.00, 1,250.00, 250)
    // อนุญาตทั้งมีทศนิยมและไม่มีทศนิยม เพราะบาง slip อาจแสดง “68” เฉย ๆ
    const allNumberRegex = /\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\b/g;
    const allMatches = text.match(allNumberRegex) || [];
    for (const raw of allMatches) {
      const val = parseFloat(raw.replace(/,/g, ''));
      if (Number.isFinite(val)) {
        candidates.push({ val, source: 'generic', line: null });
      }
    }

    // กำจัดตัวเลขที่ไม่น่าใช่จำนวนเงิน (เช่น < 1)
    const filtered = candidates.filter((c) => c.val >= 1);

    if (filtered.length === 0) {
      return res.status(400).json({ message: 'Amount not found', ocrText: text });
    }

    // --- เลือกจำนวนเงินที่เหมาะสม ---
    // ถ้ามี expectedAmount ให้เลือกค่าที่ใกล้ expectedAmount มากที่สุด
    // ถ้าไม่มี/ผิดปกติ ให้ fallback เป็นค่าที่มากที่สุด (ตามเดิม)
    let chosen = null;
    if (Number.isFinite(expectedAmount) && expectedAmount > 0) {
      // ให้ priority กับ candidate จากคีย์เวิร์ดก่อน
      const bySource = (src) => filtered.filter((c) => c.source === src);
      const keywordCands = bySource('keyword');
      const pool = keywordCands.length ? keywordCands : filtered;

      chosen = pool.reduce((best, cur) => {
        const diffBest = Math.abs(best.val - expectedAmount);
        const diffCur = Math.abs(cur.val - expectedAmount);
        return diffCur < diffBest ? cur : best;
      });
    } else {
      // fallback: ค่ามากสุด
      chosen = filtered.reduce((max, cur) => (cur.val > max.val ? cur : max));
    }

    const amount = chosen.val;

    // --- อัปเดต booking ---
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
      pickedFrom: chosen.source,
      booking,
      updateBooking,
      message:
        'Amount read from slip via URL and saved. Awaiting admin verification.',
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


