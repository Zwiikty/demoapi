// src/controllers/paymentOCR.controller.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const prisma = require('../../prisma/client');

/** ===================== CONFIG ===================== **/
const FIXED_UPLOADS_DIR =
  process.env.SLIPS_DIR || path.resolve(__dirname, '../uploads/slips');

/** ===================== OCR WORKER (singleton, load langs online) ===================== **/
let worker = null;

async function getWorkerTH() {
  if (worker) return worker;

  // v6 API: createWorker(options) -> loadLanguage(langs) -> initialize(langs)
  worker = await createWorker({
    cacheMethod: 'none',
    logger: (m) => console.log('[OCR]', m.status, m.progress ?? ''),
  });

  const langs = 'tha+eng';
  try {
    await worker.loadLanguage(langs);
    await worker.initialize(langs);
  } catch (e) {
    console.warn('[OCR] load tha+eng failed, fallback to eng only:', e?.message);
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
  }

  return worker;
}

/** ===================== Concurrency Guard ===================== **/
const MAX_CONCURRENT_OCR = Number(process.env.OCR_CONCURRENCY || 1); // 1-2 แนะนำ
let running = 0;
const queue = [];
async function withOcrSlot(fn) {
  if (running >= MAX_CONCURRENT_OCR) {
    await new Promise((resolve) => queue.push(resolve));
  }
  running++;
  try {
    return await fn();
  } finally {
    running--;
    const next = queue.shift();
    if (next) next();
  }
}

/** ===================== Utils ===================== **/
function safeJoinUploadDir(filename) {
  const base = path.basename(filename);
  return path.join(FIXED_UPLOADS_DIR, base);
}

function thaiDigitsToArabic(s) {
  const map = {
    '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
    '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
  };
  return s.replace(/[๐-๙]/g, (ch) => map[ch] ?? ch);
}

function tightenNumberGaps(s) {
  return s
    // 12 : 34 / 12 . 34 -> 12.34
    .replace(/(\d)\s*[:.]\s*(\d{2})/g, '$1.$2')
    // 1 234 -> 1234
    .replace(/(\d)\s+(\d)/g, '$1$2');
}

function normalizeDelimiters(s) {
  return s
    .replace(/[=•‧∙·˙•·]/g, '.')
    .replace(/，/g, '.')
    .replace(/[฿]/g, ''); // ตัดสัญลักษณ์บาทออก
}

function sanitizeLine(line) {
  let L = thaiDigitsToArabic(line);
  // เก็บเฉพาะตัวที่จำเป็นเพื่อลดสัญลักษณ์รบกวน
  L = L.replace(/[^\d.,:A-Za-zก-๙\s]/g, '');
  L = normalizeDelimiters(L);
  L = tightenNumberGaps(L);
  return L.trim();
}

function isTimeLike(s) {
  const L = s.toLowerCase();
  if (/\b\d{1,2}\s*[:.]\s*\d{2}\s*(น\.|am|pm)?\b/.test(L)) return true;
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}.*\d{1,2}[:.]\d{2}/.test(L)) return true;
  return false;
}

function extractDecimals(line) {
  // รองรับ 1,234.56 / 1234.56 / 12:34 (ถูกแปลงเป็น . แล้ว)
  const re = /\b\d{1,3}(?:[ ,]\d{3})*[.:]\d{2}\b|\b\d+[.:]\d{2}\b/g;
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    const val = parseFloat(m[0].replace(/ /g, '').replace(/,/g, '').replace(':', '.'));
    if (Number.isFinite(val)) out.push({ raw: m[0], val });
  }
  return out;
}

function extractIntegers(line) {
  const out = [];
  const re = /\b\d{1,3}(?:[ ,]\d{3})*\b/g; // 68, 1,234, 900
  let m;
  while ((m = re.exec(line)) !== null) {
    const val = parseFloat(m[0].replace(/,/g, ''));
    if (Number.isFinite(val)) out.push({ raw: m[0], val });
  }
  return out;
}

// คีย์เวิร์ดบวก/หน่วย/ลบ สำหรับจัดอันดับ
const POS_KEYS = [
  'จำนวนเงิน', 'จำนวน', 'ยอดชำระ', 'ยอดโอน', 'ยอดรวม', 'ยอดสุทธิ',
  'รวมทั้งสิ้น', 'รวม', 'payment', 'paid', 'amount', 'total', 'transfer',
].map((x) => x.toLowerCase());
const UNIT_KEYS = ['บาท', 'thb'];
const NEG_KEYS = [
  'ค่าธรรมเนียม', 'fee', 'charge', 'reference', 'เลขที่รายการ', 'ref',
  'รายการอ้างอิง', 'อ้างอิง', 'เวลา', 'time', 'สแกนตรวจสอบสลิป', 'scan',
  'qr', 'เลขที่', 'transaction id', 'trx', 'หมายเลขอ้างอิง',
].map((x) => x.toLowerCase());

function scoreCandidate(item, lines) {
  const line = (lines[item.line] || '').toLowerCase();
  let score = 0;
  if (POS_KEYS.some((k) => line.includes(k))) score += 3;
  if (UNIT_KEYS.some((k) => line.includes(k))) score += 2;
  if (NEG_KEYS.some((k) => line.includes(k))) score -= 5;
  if (isTimeLike(line)) score -= 6;
  if (item.val > 0 && item.val < 200000) score += 1;
  return Math.max(score, -10);
}

/** ===================== Image Preprocess ===================== **/
async function preprocessBottom(
  bufOrPath,
  { cropBottomRatio = 0.28, maxWidth = 900, upscale = 1.35 } = {}
) {
  const img = sharp(bufOrPath);
  const meta = await img.metadata();
  const h = meta.height || 0;
  const w = meta.width || 0;

  if (!w || !h) {
    throw new Error('Invalid image (no dimensions)');
  }

  const dynamicMaxWidth = w > 2000 ? 800 : maxWidth;
  const cropH = Math.max(10, Math.floor(h * cropBottomRatio));
  const targetW = Math.min(w, dynamicMaxWidth);
  const scale = w ? targetW / w : 1;
  const targetH = Math.max(10, Math.round(cropH * scale * upscale));

  return await img
    .extract({ left: 0, top: Math.max(0, h - cropH), width: w, height: cropH })
    .resize(targetW, targetH, {
      kernel: 'lanczos3',
      fit: 'cover',
      withoutEnlargement: true,
    })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

/** ===================== OCR Runner ===================== **/
async function runOcrOnBufferTH(buf) {
  const w = await getWorkerTH();
  const { data } = await w.recognize(buf, {
    tessedit_pageseg_mode: 6,
    tessedit_char_whitelist: '0123456789.,: บาท฿THB',
  });
  return data?.text || '';
}

/** ===================== Amount Picker ===================== **/
function pickAmountFromText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sanitizeLine);

  const candidates = [];
  lines.forEach((line, idx) => {
    const nums = extractDecimals(line);
    if (!nums.length) return;
    const lower = line.toLowerCase();
    nums.forEach((n) => {
      candidates.push({
        line: idx,
        context: line,
        raw: n.raw,
        val: n.val,
        flags: {
          hasPos: POS_KEYS.some((k) => lower.includes(k)),
          hasNeg: NEG_KEYS.some((k) => lower.includes(k)),
          hasUnit: UNIT_KEYS.some((k) => lower.includes(k)),
          timeLike: isTimeLike(lower),
        },
      });
    });
  });

  let chosen = null;
  if (candidates.length) {
    const scored = candidates
      .filter((x) => x.val > 0 && x.val < 200000)
      .map((x) => ({ ...x, score: scoreCandidate(x, lines) }))
      .sort((a, b) => b.score - a.score);

    if (scored.length) {
      const top = scored[0].score;
      const ties = scored.filter((s) => s.score === top);
      const withPosUnit = ties.find((t) => t.flags.hasPos && t.flags.hasUnit);
      chosen = withPosUnit || ties[0];
    }
  }

  // Fallback: เมื่อไม่เจอทศนิยม ให้ลอง “จำนวนเต็ม” บรรทัดที่มี keyword บวก/หน่วย และไม่เหมือนเวลา
  if (!chosen) {
    lines.forEach((line, idx) => {
      const ints = extractIntegers(line);
      if (!ints.length) return;
      const lower = line.toLowerCase();
      const hasPos = POS_KEYS.some((k) => lower.includes(k));
      const notTime = !isTimeLike(lower);
      if (hasPos && notTime) {
        const best = ints.find((x) => x.val > 0 && x.val < 200000);
        if (best) chosen = { line: idx, context: line, ...best, score: 0 };
      }
    });
  }

  // Fallback สุดท้าย: รวมทั้งเอกสารแล้วหาเลขทศนิยมแรก
  if (!chosen) {
    const fallback = extractDecimals(lines.join(' ')).filter((x) => x.val > 0);
    if (fallback.length)
      chosen = { line: -1, context: '(fallback)', ...fallback[0], score: -1 };
  }

  if (!chosen) return { amount: null, lines };
  const amount = Number((chosen.val ?? 0).toFixed(2));
  return { amount, lines, chosen };
}

/** ===================== Controller ===================== **/
exports.readAmountFromSlip = async (req, res) => {
  try {
    let { imagePath, bookingId, force } = req.body || {};
    bookingId = Number(bookingId);
    force = force === true || force === 'true';

    if (!bookingId) {
      return res.status(400).json({ message: 'Missing bookingId' });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        slipImage: true,
        paymentSlipAmount: true,
        paymentVerified: true,
        paymentConfirmedAt: true,
        courtId: true,
      },
    });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // default ใช้ไฟล์สลิปจาก booking
    if (!imagePath) {
      if (!booking.slipImage) {
        return res
          .status(400)
          .json({ message: 'No slipImage for this booking, please upload slip first.' });
      }
      imagePath = booking.slipImage;
    }

    // ถ้ามีผลลัพธ์ OCR เก็บไว้แล้ว และไม่ force → ส่ง cache กลับ
    if (!force && booking.paymentSlipAmount != null) {
      return res.status(200).json({
        amount: booking.paymentSlipAmount,
        booking,
        message: 'Amount already exists (cached).',
      });
    }

    const full = path.isAbsolute(imagePath)
      ? imagePath
      : safeJoinUploadDir(imagePath);

    if (!fs.existsSync(full)) {
      return res.status(404).json({ message: 'Image not found', path: full });
    }

    // เตรียมภาพ: ครอปส่วนล่าง + ทำให้ชัดขึ้น
    const preprocessedBuf = await preprocessBottom(full);

    const { amount, chosen } = await withOcrSlot(async () => {
      const text = await runOcrOnBufferTH(preprocessedBuf);
      return pickAmountFromText(text);
    });

    if (!amount) {
      return res.status(400).json({ message: 'Amount not found' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentSlipAmount: amount,
        paymentVerified: false, // ยังรอ admin verify
        paymentConfirmedAt: null,
      },
      select: {
        id: true,
        slipImage: true,
        paymentSlipAmount: true,
        paymentVerified: true,
        paymentConfirmedAt: true,
      },
    });

    return res.status(200).json({
      amount,
      booking: updated,
      debug: { chosen, mountPath: FIXED_UPLOADS_DIR },
      message:
        'Amount read from slip and saved to booking. Awaiting admin verification.',
    });
  } catch (err) {
    console.error('[OCR] error:', err);
    return res.status(500).json({ message: 'OCR failed', error: err.message });
  }
};