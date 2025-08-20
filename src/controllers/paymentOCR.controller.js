// src/controllers/paymentOCR.controller.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
// (ถ้าต้องการรองรับ URL ให้ uncomment 2 บรรทัดด้านล่าง แล้ว npm i axios)
// const axios = require('axios');
// const isHttpUrl = s => /^https?:\/\//i.test(s);

// --- FIXED MOUNT PATH (Railway Volume) ---
const FIXED_UPLOADS_DIR = '/app/src/uploads/slips';

/* ----------------------- Image Preprocess ----------------------- */
async function preprocessBottom(bufOrPath, {
  cropBottomRatio = 0.35, // ครอปล่าง ~35% ลดโอกาสอ่าน "เวลา"
  upscale = 2.0           // ขยาย 2x ช่วย OCR
} = {}) {
  const img = sharp(bufOrPath);
  const meta = await img.metadata();
  const h = meta.height, w = meta.width;
  const cropH = Math.max(10, Math.floor(h * cropBottomRatio));
  return await img
    .extract({ left: 0, top: h - cropH, width: w, height: cropH })
    .greyscale()
    .normalize()
    .threshold(0) // Otsu-like global
    .resize(Math.round(w * upscale), Math.round(cropH * upscale), { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

/* ----------------------- OCR Helpers ----------------------- */
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
// ยอมรับ '.' หรือ ':' เป็นคั่นทศนิยม แล้วแปลง ':' ตอน parse
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

/* ----------------------- Heuristics ----------------------- */
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

/* ----------------------- Controller: OCR amount only ----------------------- */
exports.readAmountFromSlip = async (req, res) => {
  try {
    const { imagePath } = req.body;
    if (!imagePath) return res.status(400).json({ message: 'Missing imagePath' });

    // ========== เตรียมอินพุต ==========
    let inputForPreprocess;
    // ---- ถ้าต้องการรองรับ URL ให้ใช้บล็อกนี้แทนและ uncomment axios กับ isHttpUrl ด้านบน ----
    // if (isHttpUrl(imagePath)) {
    //   const resp = await axios.get(imagePath, { responseType: 'arraybuffer' });
    //   inputForPreprocess = Buffer.from(resp.data);
    // } else {
    //   const full = path.isAbsolute(imagePath)
    //     ? imagePath
    //     : path.join(FIXED_UPLOADS_DIR, imagePath);
    //   if (!fs.existsSync(full)) {
    //     return res.status(404).json({ message: 'Image not found', path: full });
    //   }
    //   inputForPreprocess = full;
    // }

    // ---- เวอร์ชันไม่รองรับ URL (อ่านจาก volume ตามที่กำหนดเท่านั้น) ----
    const full = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(FIXED_UPLOADS_DIR, imagePath);
    if (!fs.existsSync(full)) {
      return res.status(404).json({ message: 'Image not found', path: full });
    }
    inputForPreprocess = full;

    // ========== Preprocess: ครอปล่าง + grayscale + threshold + upscale ==========
    const preprocessed = await preprocessBottom(inputForPreprocess);

    // ========== OCR ==========
    const result = await Tesseract.recognize(preprocessed, 'eng+tha', {
      tessedit_pageseg_mode: 6,
      tessedit_char_whitelist: '0123456789.,:/-()abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ฿บาทTHBน.',
      logger: m => console.log('[tesseract]', m?.status || m),
    });
    const rawText = result?.data?.text || '';

    // ========== Extract amount ==========
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

    // fallback: หาเลขทศนิยมตัวแรกๆ ที่ > 0 จากทุกบรรทัดรวมกัน
    if (!chosen) {
      const fallback = extractDecimals(lines.join(' ')).filter(x => x.val > 0);
      if (fallback.length) chosen = { line: -1, context: '(fallback)', ...fallback[0], score: -1 };
    }

    if (!chosen) {
      return res.status(400).json({ message: 'Amount not found', ocrText: rawText, lines });
    }

    const amount = Number(chosen.val.toFixed(2));
    return res.status(200).json({
      amount,
      debug: { chosen, candidates, lines, mountPath: FIXED_UPLOADS_DIR },
      message: 'Amount read from slip (OCR only). Admin verification required.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'OCR failed', error: err.message });
  }
};