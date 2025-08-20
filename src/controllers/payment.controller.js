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

function normalizeOcrText(s) {
  if (!s) return '';
  // แก้ตัวที่ OCR ชอบสลับกับตัวเลข
  return s
    .replace(/O/g, '0')
    .replace(/o/g, '0')
    .replace(/S/g, '5')
    .replace(/s/g, '5')
    .replace(/[Il]/g, '1')   // I, l -> 1
    .replace(/B/g, '8')
    .replace(/—|–|−/g, '-')  // dash variants
    ;
}

// แปลงสตริงตัวเลขที่มีคอมมาหรือช่องว่างให้เป็น float
function toAmount(str) {
  if (!str) return null;
  const cleaned = str.replace(/\s/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// เดา 2 หลักท้ายเป็นสตางค์ ถ้าไม่มีจุดทศนิยม (เช่น 123456 => 1234.56)
function inferDecimal(str) {
  const digits = str.replace(/\D/g, '');
  if (digits.length >= 3) {
    const whole = digits.slice(0, -2);
    const dec = digits.slice(-2);
    return parseFloat(`${whole}.${dec}`);
  }
  return null;
}

exports.readAmountFromSlip = async (req, res) => {
  const { imagePath, bookingId } = req.body;

  try {
    // โหลดรูปจาก static URL บน Railway
    const fileUrl = `${req.protocol}://${req.get('host')}/slips/${imagePath}`;
    const resp = await _fetch(fileUrl);
    if (!resp.ok) {
      return res.status(400).json({ message: 'Cannot fetch slip image', url: fileUrl });
    }
    const buffer = Buffer.from(await resp.arrayBuffer());

    // ดึง booking + court เพื่อคำนวณ expectedAmount (ใช้ช่วย disambiguate)
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(bookingId) },
      include: { court: true },
    });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const durationHours =
      (new Date(booking.endTime) - new Date(booking.startTime)) / (1000 * 60 * 60);
    const expectedAmount = booking.court.pricePerHour * durationHours;

    // OCR: ใช้ eng+tha, PSM 6, ใส่ whitelist เน้นตัวเลข/จุด/คอมมา/สัญลักษณ์เงิน
    const result = await Tesseract.recognize(buffer, 'eng+tha', {
      logger: m => console.log(m),
      tessedit_char_whitelist: '0123456789,.-฿฿ฺ฿฿THB',
    }, {
      // ค่าพารามิเตอร์แบบ OEM/PSM ผ่าน configs (รองรับใน tesseract.js รุ่นใหม่)
      // ถ้าเวอร์ชันคุณไม่รองรับ object ที่ 3 ให้ตัดบล็อกนี้ทิ้ง
      // จะใช้ default PSM 3/6 ก็ยังได้ผลใกล้เคียง
      // NOTE: บางเวอร์ชันต้องใช้ { config: { tessedit_pageseg_mode: 6 } }
      // ลองตามเวอร์ชันที่ใช้งานจริง
    });

    const rawText = result.data.text || '';
    const text = normalizeOcrText(rawText);

    // แตกเป็นบรรทัดเพื่อทำ keyword scoring
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // คีย์เวิร์ดที่พบบ่อยในสลิป
    const keywords = [
      'ยอด', 'ยอดชำระ', 'รวม', 'ชำระ', 'โอน', 'จำนวนเงิน',
      'amount', 'total', 'paid', 'payment', 'transfer'
    ];

    // รวบรวมผู้ต้องสงสัย (candidates)
    const candidates = [];

    // 1) หา pattern 1,234.56 หรือ 1234.56
    const rx1 = /\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}/g;

    // 2) หาเลขยาว ๆ แล้วเดาทศนิยม (เช่น 123456 -> 1234.56)
    const rx2 = /\b\d{4,}\b/g;

    lines.forEach((line, idx) => {
      const normalized = line.replace(/[^\d.,\- ]/g, ''); // เก็บเฉพาะตัวเลข จุด คอมมา ช่องว่าง
      // จับแบบมีทศนิยมก่อน
      const m1 = normalized.match(rx1) || [];
      m1.forEach(m => {
        const val = toAmount(m);
        if (val != null) {
          // คะแนนจาก keyword ใกล้เคียง
          const score =
            keywords.some(k => line.toLowerCase().includes(k)) ? 2 : 1;
          candidates.push({ val, source: 'decimal', line: idx, score, raw: m });
        }
      });
      // ถ้าบรรทัดไม่มีทศนิยม ลองเดา
      const m2 = normalized.match(rx2) || [];
      m2.forEach(m => {
        // ตัดตัวเลขติดลบ/มั่ว
        if (/^-/.test(m)) return;
        const val = inferDecimal(m);
        if (val != null) {
          const score =
            keywords.some(k => line.toLowerCase().includes(k)) ? 1 : 0; // เดาให้คะแนนน้อยกว่า
          candidates.push({ val, source: 'infer', line: idx, score, raw: m });
        }
      });
    });

    if (candidates.length === 0) {
      return res.status(400).json({ message: 'Amount not found', ocrText: text });
    }

    // เลือกคำตอบ:
    // 1) ถ้ามีค่าที่ใกล้ expectedAmount ภายใน ±15% ให้เอาค่านั้น
    const within = candidates
      .map(c => ({ ...c, diff: Math.abs(c.val - expectedAmount) }))
      .filter(c => expectedAmount > 0
        ? Math.abs(c.val - expectedAmount) <= expectedAmount * 0.15
        : true // ถ้า expectedAmount=0 ไม่ filter
      )
      .sort((a, b) => (b.score - a.score) || (a.diff - b.diff));

    let chosen;
    if (within.length > 0) {
      chosen = within[0];
    } else {
      // 2) มิฉะนั้น เลือกจากคะแนนมากสุด แล้วค่อยเลือกค่ามากสุดในกลุ่มคะแนนเดียวกัน
      const maxScore = Math.max(...candidates.map(c => c.score));
      const top = candidates.filter(c => c.score === maxScore);
      // ถ้าเท่ากันหมด เอาค่ามากสุด (มักเป็นยอดรวม)
      chosen = top.sort((a, b) => b.val - a.val)[0];
    }

    const amount = chosen.val;

    // เซฟลง booking
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
      debug: {
        picked: chosen,
        candidates: candidates.slice(0, 5), // ตัดเหลือดูง่าย ๆ
      },
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


