const cron = require('node-cron');

const startChargeFlows = require('./startChargeFlows');
const retryCharges = require('./retryCharges');
const pingMonitoring = require('./pingMonitoring');
const increaseDebts = require('./increaseDebts');
const updateTrialPeriods = require('./updateTrialPeriods');

module.exports.start = () => {
  // Runs every day at 12:00 a.m.
  cron.schedule('0 0 * * *', async () => {
    await retryCharges();
    await startChargeFlows();
  });

  // Runs every minute
  cron.schedule('* * * * *', async () => {
    await updateTrialPeriods();
    await increaseDebts();
  });

  cron.schedule('* * * * *', async () => {
    await pingMonitoring();
  });
};
