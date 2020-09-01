const cron = require('node-cron');

const startChargeFlows = require('./startChargeFlows');
const retryCharges = require('./retryCharges');
const pingMonitoring = require('./pingMonitoring');
const increaseDebts = require('./increaseDebts');
const checkUserTrialJob = require('./checkUserTrialJob');
const checkProjectCredentials = require('./checkProjectCredentials');

module.exports.start = () => {
  // Runs every day at 12:00 a.m.
  cron.schedule('0 0 * * *', async () => {
    await retryCharges();
    await startChargeFlows();
  });

  // Runs every minute
  cron.schedule('* * * * *', async () => {
    await increaseDebts();
  });

  cron.schedule('* * * * *', async () => {
    await pingMonitoring();
  });

  cron.schedule('* * * * *', async () => {
    await checkUserTrialJob();
  });

  cron.schedule('*/5 * * * *', async () => {
    await checkProjectCredentials();
  });
};
