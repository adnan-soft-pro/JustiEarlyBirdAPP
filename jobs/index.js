const cron = require('node-cron');

const startChargeFlows = require('./startChargeFlows');
const retryCharges = require('./retryCharges');

module.exports.start = () => {
  // Runs every day at 12:00 a.m.
  cron.schedule('* * * * *', async () => {
    await retryCharges();
    await startChargeFlows();
  });
};
