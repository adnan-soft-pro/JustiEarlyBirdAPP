module.exports = {
  database: {
    db_url: process.env.DB_URL,
  },
  app: {
    port: process.env.PORT || 3000,
    stripeSecret: process.env.STRIPE_SECRET || '',
    frontendURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    jwtSecret: process.env.TOKEN_SECRET,
    monitoringUrl: process.env.MONITORING_URL,
    nowPlanPriceId: process.env.NOW_PLAN_PRICE_ID,
    trialPeriodLaterPlan: process.env.TRIAL_PERIOD_LATER_PLAN || 3,
    pricePerDayLaterPlan: process.env.PRICE_PER_DAY_LATER_PLAN || 1500,
    emailFrom: process.env.EMAIL_FROM,
    sendgripApiKey: process.env.SENDGRID_API_KEY,
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoDBName: process.env.DYNAMO_DB || 'test_db',
  },
};
