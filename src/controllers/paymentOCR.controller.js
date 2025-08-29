// src/controllers/paymentOCR.controller.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const prisma = require('../../prisma/client');
const FIXED_UPLOADS_DIR = process.env.SLIPS_DIR || path.resolve(__dirname, '../uploads/slips');

/* ===================== OCR WORKER (singleton, Thai only) ===================== */
let worker = null;
async function getWorkerTH() {
  if (!worker) {
    worker = await Tesseract.createWorker({
    });
    await worker.loadLanguage('tha');
    await worker.initialize('tha');
  }
  return worker;
}

const MAX_CONCURRENT_OCR = Number(process.env.OCR_CONCURRENCY || 1); // 1-2
let running = 0;
const queue = [];
async function withOcrSlot(fn) {
  if (running >= MAX_CONCURRENT_OCR) {
    await new Promise(resolve => queue.push(resolve));
  }
  running++;
  try { return await fn(); }
  finally {
    running--;
    const next = queue.shift();
    if (next) next();
  }
}

function safeJoinUploadDir(filename) {
  const base = path.basename(filename);
  return path.join(FIXED_UPLOADS_DIR, base);
}

function thaiDigitsToArabic(s) {
  const map = { '๐':'0','๑':'1','๒':'2','๓':'3','๔':'4','๕':'5','๖':'6','๗':'7','๘':'8','๙':'9' };
  return s.replace(/[๐-๙]/g, ch => map[ch] ?? ch);
}
function tightenNumberGaps(s) {
  return s
    .replace(/(\d)\s+([.,:])\s*(\d{2})/g, '$1.$3')
    .replace(/(\d)\s+(\d)/g, '$1$2');
}
function normalizeDelimiters(s) {
  return s.replace(/[=•‧∙·˙•·]/g, '.').replace(/，/g, '.').replace(/฿/g, '');
}
function sanitizeLine(line) {
  let L = thaiDigitsToArabic(line);
  L = L.replace(/O/g,'0').replace(/o/g,'0').replace(/[lI]/g,'1').replace(/S/g,'5').replace(/B/g,'8');
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
  const re = /\b\d{1,3}(?:[ ,]\d{3})*[.:]\d{2}\b|\b\d+[.:]\d{2}\b/g;
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    const val = parseFloat(m[0].replace(/ /g,'').replace(/,/g,'').replace(':','.'));
    if (Number.isFinite(val)) out.push({ raw: m[0], val });
  }
  return out;
}

const POS_KEYS = ['จำนวนเงิน','จำนวน','ยอดชำระ','ยอดโอน','ยอดรวม','ยอดสุทธิ','รวมทั้งสิ้น','รวม','payment','paid','amount','total','transfer'].map(x=>x.toLowerCase());
const UNIT_KEYS = ['บาท','thb'];
const NEG_KEYS = ['ค่าธรรมเนียม','fee','charge','reference','เลขที่รายการ','ref','รายการอ้างอิง','อ้างอิง','เวลา','time','สแกนตรวจสอบสลิป','scan','qr','เลขที่','transaction id','trx','หมายเลขอ้างอิง'].map(x=>x.toLowerCase());

function scoreCandidate(item, lines) {
  const line = (lines[item.line] || '').toLowerCase();
  let score = 0;
  if (POS_KEYS.some(k => line.includes(k))) score += 3;
  if (UNIT_KEYS.some(k => line.includes(k))) score += 2;
  if (NEG_KEYS.some(k => line.includes(k))) score -= 5;
  if (isTimeLike(line)) score -= 6;
  if (item.val > 0 && item.val < 200000) score += 1;
  return Math.max(score, -10);
}

async function preprocessBottom(bufOrPath, {
  cropBottomRatio = 0.28,
  maxWidth = 900,
  upscale = 1.35
} = {}) {
  const img = sharp(bufOrPath);
  const meta = await img.metadata();
  const h = meta.height || 0;
  const w = meta.width || 0;
  if (!w || !h) {
  return res.status(400).json({ message: 'Invalid image (no dimensions)' });
}
  const dynamicMaxWidth = w > 2000 ? 800 : maxWidth;

  const cropH = Math.max(10, Math.floor(h * cropBottomRatio));
  const targetW = Math.min(w, dynamicMaxWidth);
  const scale = w ? (targetW / w) : 1;
  const targetH = Math.max(10, Math.round(cropH * scale * upscale));

  return await img
    .extract({ left: 0, top: Math.max(0, h - cropH), width: w, height: cropH })
    .resize(targetW, targetH, { kernel: 'lanczos3', fit: 'cover', withoutEnlargement: true })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

async function runOcrOnBufferTH(buf) {
  const w = await getWorkerTH();
  const { data } = await w.recognize(buf, {
    tessedit_pageseg_mode: 6,
    tessedit_char_whitelist: '0123456789.,: บาท฿THB'
  });
  return data?.text || '';
}

function pickAmountFromText(rawText) {
  const lines = rawText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(sanitizeLine);
  const candidates = [];
  lines.forEach((line, idx) => {
    const nums = extractDecimals(line);
    if (!nums.length) return;
    const lower = line.toLowerCase();
    nums.forEach(n => {
      candidates.push({
        line: idx,
        context: line,
        raw: n.raw,
        val: n.val,
        flags: {
          hasPos: POS_KEYS.some(k => lower.includes(k)),
          hasNeg: NEG_KEYS.some(k => lower.includes(k)),
          hasUnit: UNIT_KEYS.some(k => lower.includes(k)),
          timeLike: isTimeLike(lower),
        },
      });
    });
  });

  let chosen = null;
  if (candidates.length) {
    const scored = candidates
      .filter(x => x.val > 0 && x.val < 200000)
      .map(x => ({ ...x, score: scoreCandidate(x, lines) }))
      .sort((a,b) => b.score - a.score);

    if (scored.length) {
      const top = scored[0].score;
      const ties = scored.filter(s => s.score === top);
      const withPosUnit = ties.find(t => t.flags.hasPos && t.flags.hasUnit);
      chosen = withPosUnit || ties[0];
    }
  }

  if (!chosen) {
    const fallback = extractDecimals(lines.join(' ')).filter(x => x.val > 0);
    if (fallback.length) chosen = { line: -1, context: '(fallback)', ...fallback[0], score: -1 };
  }

  if (!chosen) return { amount: null, lines };
  const amount = Number(chosen.val.toFixed(2));
  return { amount, lines, chosen };
}


exports.readAmountFromSlip = async (req, res) => {
  try {
    let { imagePath, bookingId, force } = req.body || {};
    bookingId = Number(bookingId);

    if (!bookingId) return res.status(400).json({ message: 'Missing bookingId' });
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, slipImage: true, paymentSlipAmount: true, paymentVerified: true, paymentConfirmedAt: true }
    });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (!imagePath) {
      if (!booking.slipImage) {
        return res.status(400).json({ message: 'No slipImage for this booking, please upload slip first.' });
      }
      imagePath = booking.slipImage;
    }

    if (!force && booking.paymentSlipAmount != null) {
      return res.status(200).json({
        amount: booking.paymentSlipAmount,
        booking,
        message: 'Amount already exists (cached).'
      });
    }

    const full = path.isAbsolute(imagePath) ? imagePath : safeJoinUploadDir(imagePath);
    if (!fs.existsSync(full)) {
      return res.status(404).json({ message: 'Image not found', path: full });
    }

    const preprocessedBuf = await preprocessBottom(full);

    const { amount, lines, chosen } = await withOcrSlot(async () => {
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
        paymentVerified: false,
        paymentConfirmedAt: null,
      },
      select: { id: true, slipImage: true, paymentSlipAmount: true, paymentVerified: true, paymentConfirmedAt: true },
    });

    return res.status(200).json({
      amount,
      booking: updated,
      debug: { chosen, mountPath: FIXED_UPLOADS_DIR },
      message: 'Amount read from slip and saved to booking. Awaiting admin verification.',
    });
  } catch (err) {
    console.error('[OCR] error:', err);
    return res.status(500).json({ message: 'OCR failed', error: err.message });
  }
};