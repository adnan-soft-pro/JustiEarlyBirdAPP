module.exports = [
  'DB_URL',
  'HTTP_PORT',
  'HTTPS_PORT',
  'STRIPE_SECRET',
  'FRONTEND_URL',
  'TOKEN_SECRET',
  'NOW_PLAN_PRICE_ID',
  'TRIAL_PERIOD_LATER_PLAN',
  'PRICE_PER_DAY_LATER_PLAN',
  'EMAIL_FROM',
  'SENDGRID_API_KEY',
  'TRACKINGID',
  'AWS_REGION',
  'DYNAMO_DB',
  'PRIV_KEY_PATH',
  'CERTS_PATH',
  'HTTPS',
];

if (process.NODE_ENV === 'production') {
  module.exports.push(...[
    'MONITORING_URL',
  ]);
}
