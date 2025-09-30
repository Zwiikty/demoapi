const prisma = require('../../prisma/client');

exports.registerToken = async (req, res) => {
  try {
    const userId = req.user.id; // ต้องมี auth middleware ตั้งค่า req.user
    const { token, platform = 'android' } = req.body;

    if (!token) return res.status(400).json({ message: 'token is required' });

    // upsert: ถ้ามี token นี้แล้ว อัปเดต user/แพลตฟอร์ม
    const saved = await prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { token, userId, platform },
    });

    res.json({ ok: true, deviceTokenId: saved.id });
    console.log('Received token:', token, 'for userId:', userId);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.unregisterToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'token is required' });

    await prisma.deviceToken.deleteMany({ where: { token, userId } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
};