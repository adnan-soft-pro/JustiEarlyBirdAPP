const ua = require('universal-analytics');
const config = require('../config/index').app;
/* eslint-disable no-irregular-whitespace */
const visitor = ua(config.trackingId);
module.exports = (category, action, label) => {
  if (process.env.NODE_ENV !== 'test') visitor.event(category, action, label).send();
};
