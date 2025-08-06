const cron = require('node-cron');
const { checkAndSendNotifications } = require('../controllers/noti.controller');

const setupNotificationScheduler = (io) => {
  cron.schedule('* * * * *', async () => {
    await checkAndSendNotifications(io);
  });
};

module.exports = setupNotificationScheduler;
