const dayjs = require('../utils/dayjs_th');
const prisma = require('../../prisma/client');
const { sendToTokens } = require('../services/fcm.service');
const NOTIFY_WINDOW_SECONDS = 60;

exports.checkAndSendNotifications = async (io) => {
  const now = dayjs().tz('Asia/Bangkok');
  const withinHour = await prisma.booking.findMany({
    where: {
      startTime: {
        gte: now.toDate(),
        lte: now.add(1, 'hour').toDate(),
      },
      notiBeforeUse: { not: null },
      remindedAt: null,
    },
    include: {
      user: true,
    },
  });

  for (const booking of withinHour) {
    const notifyTime = dayjs(booking.startTime).tz('Asia/Bangkok').subtract(booking.notiBeforeUse, 'minute');

    if (now.isBefore(notifyTime) || now.isAfter(notifyTime.add(NOTIFY_WINDOW_SECONDS - 1, 'second'))) {
      continue;
    }

    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, remindedAt: null },
      data: { remindedAt: new Date() },
    });

    if (claimed.count === 0) {
      continue;
    }

    const msgText = `แจ้งเตือน: คุณมีการจองสนามเวลา ${dayjs(booking.startTime).format('HH:mm')} น.`;
    const payload = {
      notification: {
        title: 'เตือนการจองสนาม',
        body: msgText,
      },
      data: {
        bookingId: String(booking.id),
        startTime: dayjs(booking.startTime).toISOString(),
        notiBeforeUse: String(booking.notiBeforeUse ?? 0),
      },
    };

    try {
      io.to(`user_${booking.userId}`).emit('booking-reminder', {
        message: msgText,
        bookingId: booking.id,
      });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    try {
      const tokens = await prisma.deviceToken.findMany({
        where: { userId: booking.userId },
        select: { token: true },
      });
      const tokenList = tokens.map(t => t.token);

      if (tokenList.length > 0 && typeof sendToTokens === 'function') {
        const res = await sendToTokens(tokenList, payload);

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
        console.log(`📲 FCM => user ${booking.userId}: success=${res.successCount ?? 0} fail=${res.failureCount ?? 0}`);
      }
    } catch (e) {
      console.error('FCM send error:', e);
    }

    console.log(`📢 แจ้งเตือน booking #${booking.id} ให้ userId: ${booking.userId}`);
  }
};