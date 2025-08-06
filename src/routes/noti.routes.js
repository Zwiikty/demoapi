const express = require('express');
const router = express.Router();
const prisma = require('../../prisma/client');
const  { authenticate , authorize } = require('../middleware/auth.middleware');

router.put('/noti-setting/:bookingId', authenticate, authorize(['CUSTOMER']), async (req, res) => {
  const { bookingId } = req.params;
  const { notiBeforeUse } = req.body;

  if (!notiBeforeUse || notiBeforeUse < 5) {
    return res.status(400).json({ message: 'กรุณากรอกเวลาล่วงหน้าเป็นนาที (ขั้นต่ำ 5 นาที)' });
  }

  try {
    const booking = await prisma.booking.update({
      where: { id: parseInt(bookingId) },
      data: { notiBeforeUse },
    });

    res.json({ message: 'อัปเดตการแจ้งเตือนสำเร็จ', booking });
  } catch (error) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error });
    console.log({ message: 'เกิดข้อผิดพลาด',error });
  }
});

module.exports = router;
