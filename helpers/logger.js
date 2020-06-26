/* eslint-disable no-console */
const logger = {
  error: (log) => {
    console.error(`${new Date().toUTCString()}: ${log}`);
  },
  info: (log) => {
    console.info(`${new Date().toUTCString()}: ${log}`);
  },
  debug: (log) => {
    console.debug(`${new Date().toUTCString()}: ${log}`);
  },
  warn: (log) => {
    console.warn(`${new Date().toUTCString()}: ${log}`);
  },
};
module.exports = logger;
