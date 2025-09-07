const prisma = require('../../prisma/client');
const { sendToTokens } = require('../services/fcm.service');

exports.notifyUser = async (io, userId, socketEvent, socketPayload, fcmPayload) => {
  // 1) In-app via Socket
  try {
    io.to(`user_${userId}`).emit(socketEvent, socketPayload);
  } catch (e) {
    console.error('Socket emit error:', e);
  }

  // 2) Push via FCM
  try {
    const tokens = await prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    const tokenList = tokens.map(t => t.token);
    if (tokenList.length === 0) return;

    const res = await sendToTokens(tokenList, fcmPayload);

    // เก็บกวาด token ที่ตาย
    if (res?.results?.length) {
      const bad = [];
      res.results.forEach((r, i) => {
        if (r.error) {
          const code = r.error.errorInfo?.code || r.error.code || '';
          if (String(code).includes('registration-token-not-registered') ||
              String(code).includes('invalid-registration-token')) {
            bad.push(tokenList[i]);
          }
        }
      });
      if (bad.length) {
        await prisma.deviceToken.deleteMany({ where: { token: { in: bad } } });
        console.log(`🧹 removed invalid tokens: ${bad.length}`);
      }
    }
  } catch (e) {
    console.error('FCM send error:', e);
  }
};