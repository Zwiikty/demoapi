const admin = require('firebase-admin');

// ===== Init from BASE64 ENV =====
function getServiceAccountFromEnv() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_BASE64');
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

let inited = false;
function initFCM() {
  if (inited) return;
  const cred = admin.credential.cert(getServiceAccountFromEnv());
  admin.initializeApp({ credential: cred });
  inited = true;
  console.log('✅ FCM initialized');
}

async function sendToTokens(tokens, payload, options = {}) {
  initFCM();
  if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0, results: [] };

  // default high priority
  const android = {
    priority: 'high',
    notification: {
      channelId: 'booking_reminder_ch', // ให้ตรงกับ client
      sound: 'default',
    },
  };

  const message = {
    tokens,
    notification: payload.notification, // { title, body }
    data: payload.data || {},           // ใส่ bookingId ฯลฯ
    android,
  };

  if (process.env.FCM_DRY_RUN === 'true') {
    console.log('🧪 [DRY RUN] would send FCM:', { tokens, payload });
    return { successCount: 0, failureCount: 0, results: [] };
  }

  const res = await admin.messaging().sendEachForMulticast(message);
  return res;
}

module.exports = { sendToTokens };