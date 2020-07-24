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
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoDBName: process.env.DYNAMO_DB || 'test_db',
  },
};
