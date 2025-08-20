// src/controllers/paymentOCR.controller.js
const path = require('path');
const Tesseract = require('tesseract.js');
const prisma = require('../../prisma/client');

/* ----------------------- Utilities ----------------------- */

// แปลงเลขไทย → อารบิก
function thaiDigitsToArabic(s) {
  const map = { '๐':'0','๑':'1','๒':'2','๓':'3','๔':'4','๕':'5','๖':'6','๗':'7','๘':'8','๙':'9' };
  return s.replace(/[๐-๙]/g, ch => map[ch] ?? ch);
}

// ลดช่องว่างระหว่างตัวเลข เช่น "7 0 . 0 0" -> "70.00"
function tightenNumberGaps(s) {
  return s
    .replace(/(\d)\s+([.,:])\s*(\d{2})/g, '$1.$3') // กรณีคั่นทศนิยม
    .replace(/(\d)\s+(\d)/g, '$1$2');
}

// normalize คั่นทศนิยมที่ OCR ชอบอ่านเพี้ยน → '.'
// (หลีกเลี่ยง colon ':' เพื่อไม่ให้กระทบเวลา)
function normalizeDelimiters(s) {
  return s
    .replace(/[=•‧∙·˙•·]/g, '.') // รูปแบบจุดหลากหลาย
    .replace(/，/g, '.')          // comma จีน
    .replace(/[฿฿]/g, '')        // ลบสัญลักษณ์สกุลเงิน
    ;
}

// ซ่อมอักขระที่มักสลับกับตัวเลข + ทำความสะอาด
function sanitizeLine(line) {
  let L = line;
  L = thaiDigitsToArabic(L);
  L = L.replace(/O/g, '0').replace(/o/g, '0');     // O → 0
  L = L.replace(/[lI]/g, '1');                     // l/I → 1
  L = L.replace(/S/g, '5');                        // S → 5 (บางสลิป)
  L = L.replace(/B/g, '8');                        // B → 8 (บางสลิป)
  L = normalizeDelimiters(L);
  L = tightenNumberGaps(L);
  return L.trim();
}

// ตรวจว่าเป็นบรรทัดที่ “น่าจะเป็นเวลา”
function isTimeLike(s) {
  const L = s.toLowerCase();
  // 15:16, 15.16, 05:09 น., AM/PM
  if (/\b\d{1,2}\s*[:.]\s*\d{2}\s*(น\.|am|pm)?\b/.test(L)) return true;
  // รูปแบบวันที่แล้วตามด้วยเวลา (กันพลาด)
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}.*\d{1,2}[:.]\d{2}/.test(L)) return true;
  return false;
}

// จับเลขทศนิยมสองตำแหน่ง (ยอมรับ ':' เป็นตัวคั่นใน match แล้วแปลงตอน parse)
// รองรับเลขหลักพันมีช่องว่าง/คอมมา
function extractDecimals(line) {
  const re = /\b\d{1,3}(?:[ ,]\d{3})*[.:]\d{2}\b|\b\d+[.:]\d{2}\b/g;
  const found = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    const raw = m[0]
      .replace(/ /g, '')
      .replace(/,/g, '')
      .replace(':', '.'); // แปลงเฉพาะ match
    const val = parseFloat(raw);
    if (Number.isFinite(val)) found.push({ raw: m[0], val });
  }
  return found;
}

/* ----------------------- Scoring Heuristics ----------------------- */

// คีย์เวิร์ดที่ “ชี้ว่าเป็นยอดเงิน”
const POS_KEYS = [
  'จำนวนเงิน','จำนวน','ยอดชำระ','ยอดโอน','ยอดรวม','ยอดสุทธิ','รวมทั้งสิ้น','รวม',
  'payment','paid','amount','total','transfer'
].map(x => x.toLowerCase());

// หน่วยเงิน
const UNIT_KEYS = ['บาท','thb'];

// คีย์เวิร์ดที่ควร “ตัดออก”
const NEG_KEYS = [
  'ค่าธรรมเนียม','fee','charge',
  'reference','เลขที่รายการ','ref','รายการอ้างอิง','อ้างอิง',
  'เวลา','time','สแกนตรวจสอบสลิป','scan','qr',
  'เลขที่','transaction id','trx','หมายเลขอ้างอิง'
].map(x => x.toLowerCase());

function scoreCandidate(item, lines, expectedAmount) {
  const line = (lines[item.line] || '').toLowerCase();
  let score = 0;

  // + ใกล้คีย์เวิร์ดบวก
  if (POS_KEYS.some(k => line.includes(k))) score += 3;

  // + มีหน่วยเงิน
  if (UNIT_KEYS.some(k => line.includes(k))) score += 2;

  // - เจอคีย์เวิร์ดลบ
  if (NEG_KEYS.some(k => line.includes(k))) score -= 5;

  // - บรรทัดเหมือนเวลา
  if (isTimeLike(line)) score -= 6;

  // + ค่าดูสมเหตุสมผล
  if (item.val > 0 && item.val < 200000) score += 1;

  // + ถ้ามี expectedAmount ให้บวกตามความใกล้
  if (Number.isFinite(expectedAmount) && expectedAmount > 0) {
    const relErr = Math.abs(item.val - expectedAmount) / expectedAmount;
    if (relErr <= 0.05) score += 5;       // ±5%
    else if (relErr <= 0.10) score += 4;  // ±10%
    else if (relErr <= 0.20) score += 3;  // ±20%
    else if (relErr <= 0.35) score += 1;  // เผื่อ OCR เบี้ยว
  }

  // เพดานคะแนนลบต่ำสุด
  if (score < -10) score = -10;
  return score;
}

/* ----------------------- Main Controller ----------------------- */

exports.readAmountFromSlip = async (req, res) => {
  const { imagePath, bookingId } = req.body;

  if (!imagePath || !bookingId) {
    return res.status(400).json({ message: 'Missing imagePath or bookingId' });
  }

  // 1) โหลด booking ก่อน เพื่อคำนวณ expectedAmount
  let expectedAmount = null;
  let booking = null;

  try {
    booking = await prisma.booking.findUnique({
      where: { id: Number(bookingId) },
      include: { court: true },
    });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    const durationHours = (new Date(booking.endTime) - new Date(booking.startTime)) / (1000 * 60 * 60);
    expectedAmount = Number(booking.court?.pricePerHour || 0) * durationHours || null;
  } catch (e) {
    // ถ้าอ่าน booking ไม่ได้ ไม่ต้องล้ม — แต่อาจพลาดการช่วยตัดสินใจ
    expectedAmount = null;
  }

  // 2) OCR
  const fullPath = path.join(__dirname, '../uploads/slips/', imagePath);
  let ocrText = '';
  try {
    const result = await Tesseract.recognize(fullPath, 'eng+tha', {
      // แนะนำ PSM 6/7 ให้เน้นบรรทัด
      tessedit_pageseg_mode: 6,
      // พยายามจำกัด charset ให้เน้นที่จำเป็น
      tessedit_char_whitelist: '0123456789.,:/-()abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ฿บาทTHBน.',
      logger: m => console.log('[tesseract]', m?.status || m),
    });
    ocrText = result?.data?.text || '';
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'OCR failed', error: error.message });
  }

  // 3) เตรียมบรรทัด + sanitize
  const lines = ocrText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(sanitizeLine);

  // 4) ดึงตัวเลขจากทุกบรรทัด
  const all = [];
  lines.forEach((line, idx) => {
    const nums = extractDecimals(line);
    if (!nums.length) return;

    const lower = line.toLowerCase();
    const hasPos = POS_KEYS.some(k => lower.includes(k));
    const hasNeg = NEG_KEYS.some(k => lower.includes(k));
    const hasUnit = UNIT_KEYS.some(k => lower.includes(k));

    nums.forEach(n => {
      all.push({
        line: idx,
        context: line,
        raw: n.raw,
        val: n.val,
        flags: { hasPos, hasNeg, hasUnit, timeLike: isTimeLike(lower) },
      });
    });
  });

  // 5) ให้คะแนน + เลือกผลลัพธ์
  let chosen = null;
  if (all.length) {
    const scored = all
      .filter(x => x.val > 0 && x.val < 200000)
      .map(x => ({ ...x, score: scoreCandidate(x, lines, expectedAmount) }))
      .sort((a, b) => b.score - a.score);

    if (scored.length) {
      // ถ้าคะแนนเสมอหลายตัว ให้เลือกที่ใกล้ expectedAmount ที่สุด
      chosen = scored[0];
      if (Number.isFinite(expectedAmount) && expectedAmount > 0) {
        const topScore = scored[0].score;
        const ties = scored.filter(s => s.score === topScore);
        if (ties.length > 1) {
          chosen = ties.reduce((best, cur) => {
            const dBest = Math.abs(best.val - expectedAmount);
            const dCur  = Math.abs(cur.val - expectedAmount);
            return dCur < dBest ? cur : best;
          }, ties[0]);
        }
      }
    }
  }

  // 6) Fallback—ลองจับตัวเลขทั้งก้อน ถ้ายังไม่เจอเลย
  if (!chosen) {
    const fallback = extractDecimals(sanitizeLine(ocrText));
    if (fallback.length) {
      chosen = { line: -1, context: '(fallback)', raw: fallback[0].raw, val: fallback[0].val, score: -1 };
    }
  }

  if (!chosen) {
    return res.status(400).json({ message: 'Amount not found', ocrText });
  }

  const amount = Number(chosen.val.toFixed(2));

  // 7) อัปเดต booking (เก็บยอดจากสลิป, ยังไม่ยืนยัน)
  let updateBooking = null;
  try {
    updateBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentSlipAmount: amount,
        paymentVerified: false,
        paymentConfirmedAt: null,
      },
    });
  } catch (e) {
    // อัปเดตไม่ได้ก็ยังส่งผล OCR คืนไปให้ตรวจได้
    console.error('Prisma update error:', e);
  }

  return res.status(200).json({
    amount,
    expectedAmount,
    booking,
    updateBooking,
    debug: {
      chosen,
      candidates: all,     // ดูว่า OCR เจอเลขอะไรบ้าง
      lines,               // บรรทัดหลัง sanitize
      rawText: ocrText,    // ข้อความดิบ
    },
    message: 'Amount read from slip. Awaiting admin verification.',
  });
};