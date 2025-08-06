const dayjs = require('../utils/dayjs_th');
const prisma = require('../../prisma/client');

// ส่ง socket ไปด้วยเพื่อยิง noti
exports.checkAndSendNotifications = async (io) => {
  const now = dayjs();

  // ดึง booking ที่ยังไม่เริ่ม และอยู่ในช่วงกำลังจะถึง
  const bookings = await prisma.booking.findMany({
    where: {
      startTime: {
        gte: now.toDate(),
        lte: now.add(1, 'hour').toDate(), // ตรวจล่วงหน้าในช่วง 1 ชม.
      },
      notiBeforeUse: {
        not: null,
      },
    },
    include: {
      user: true,
    },
  });

  bookings.forEach((booking) => {
    const notifyTime = dayjs(booking.startTime).subtract(booking.notiBeforeUse, 'minute');
    const nowFormatted = now.format('YYYY-MM-DD HH:mm');
    const notifyFormatted = notifyTime.format('YYYY-MM-DD HH:mm');

    if (nowFormatted === notifyFormatted) {
      const message = `แจ้งเตือน: คุณมีการจองสนามเวลา ${dayjs(booking.startTime).format('HH:mm')} น.`;

      // ส่งผ่าน socket
      io.to(`user_${booking.userId}`).emit('booking-reminder', {
        message,
        bookingId: booking.id,
      });

      console.log(`📢 แจ้งเตือน booking #${booking.id} ให้ userId: ${booking.userId}`);
    }
  });
};
