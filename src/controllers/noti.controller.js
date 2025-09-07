const dayjs = require('../utils/dayjs_th');
const prisma = require('../../prisma/client');
const { sendToTokens } = require('../services/fcm.service'); // ถ้าคุณใช้ FCM, มีไฟล์นี้จากขั้นก่อนหน้า

// ใช้ window 60 วิ เพื่อลด miss จากดีเลย์ cron
const NOTIFY_WINDOW_SECONDS = 60;

exports.checkAndSendNotifications = async (io) => {
  const now = dayjs();

  // 1) ดึง bookings ภายใน 1 ชม. ที่ยังไม่จบ และมี notiBeforeUse
  //    (เราไม่สามารถคำนวณ "notifyTime = startTime - notiBeforeUse" ใน query ได้ง่าย ๆ
  //     เลยคัดมาก่อน แล้วไปกรองด้วย JS และทำ update แบบ atomic กันซ้ำ)
  const withinHour = await prisma.booking.findMany({
    where: {
      startTime: {
        gte: now.toDate(),
        lte: now.add(1, 'hour').toDate(),
      },
      notiBeforeUse: { not: null },
      // กันยิงซ้ำ: เอาเฉพาะที่ยังไม่เคยเตือน
      remindedAt: null,
    },
    include: {
      user: true,
    },
  });

  for (const booking of withinHour) {
    const notifyTime = dayjs(booking.startTime).subtract(booking.notiBeforeUse, 'minute');

    // 2) แจ้งเมื่อ now อยู่ในช่วง [notifyTime, notifyTime+59s]
    if (now.isBefore(notifyTime) || now.isAfter(notifyTime.add(NOTIFY_WINDOW_SECONDS - 1, 'second'))) {
      continue;
    }

    // 3) อัปเดต remindedAt แบบมีเงื่อนไข (atomic) เพื่อกันยิงซ้ำ
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, remindedAt: null },
      data: { remindedAt: new Date() },
    });

    if (claimed.count === 0) {
      // มี process อื่น claim ไปแล้ว
      continue;
    }

    // 4) สร้างข้อความและยิงแจ้งเตือน
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

    // 4.1 ส่งผ่าน Socket (In-App)
    try {
      io.to(`user_${booking.userId}`).emit('booking-reminder', {
        message: msgText,
        bookingId: booking.id,
      });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    // 4.2 ส่งผ่าน FCM (ถ้าตั้งค่าไว้)
    try {
      const tokens = await prisma.deviceToken.findMany({
        where: { userId: booking.userId },
        select: { token: true },
      });
      const tokenList = tokens.map(t => t.token);

      if (tokenList.length > 0 && typeof sendToTokens === 'function') {
        const res = await sendToTokens(tokenList, payload);

        // เก็บกวาด token ตาย (optional)
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