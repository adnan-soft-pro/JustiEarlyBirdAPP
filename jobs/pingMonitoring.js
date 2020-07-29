const axios = require('axios');
const config = require('../config').app;
const logger = require('../helpers/logger');

const serviceName = 'backendApi';

module.exports = async () => {
  try {
    logger.debug('ping monitoring');
    await axios.default.post(
      config.monitoringUrl,
      { serviceName },
    );
  } catch (err) {
    logger.error("Can't ping monitoring");
    logger.error(err);
  }
};
