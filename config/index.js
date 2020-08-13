/* eslint-disable no-param-reassign */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
/* eslint-disable no-undef */
/* eslint-disable no-console */
/* eslint-disable no-multi-assign */

const { getParamsListFromParameterStore } = require('../helpers/parameterStore');
const { envVarsFullList, productionOnly } = require('./envVarsList');

const getConfig = ()/* : Object */ => ({
  database: {
    db_url: process.env.DB_URL,
  },
  app: {
    port: process.env.PORT,
    stripeSecret: process.env.STRIPE_SECRET,
    frontendURL: process.env.FRONTEND_URL,
    jwtSecret: process.env.TOKEN_SECRET,
    monitoringUrl: process.env.MONITORING_URL,
    nowPlanPriceId: process.env.NOW_PLAN_PRICE_ID,
    trialPeriodLaterPlan: process.env.TRIAL_PERIOD_LATER_PLAN,
    pricePerDayLaterPlan: process.env.PRICE_PER_DAY_LATER_PLAN,
    emailFrom: process.env.EMAIL_FROM,
    sendgripApiKey: process.env.SENDGRID_API_KEY,
    trackingId: process.env.TRACKINGID,
  },
  aws: {
    region: process.env.AWS_REGION,
    dynamoDBName: process.env.DYNAMO_DB,
  },

});

const config = getConfig();
const defaultConfig = {
  database: {
  },
  app: {
    port: 3000,
    stripeSecret: '',
    frontendURL: 'http://localhost:3000',
    trialPeriodLaterPlan: 3,
    pricePerDayLaterPlan: 1500,
  },
  aws: {
    region: 'us-east-1',
    dynamoDBName: 'test_db',
  },
};

let requiredParams = [];
let recievedParams = [];
let invalidParams = [];
let paramsFromParameterStore = [];

const recieveParams = async (varName) => {
  paramsFromParameterStore = await getParamsListFromParameterStore(requiredParams);
  recievedParams = [...recievedParams, ...paramsFromParameterStore.recievedParams];
  invalidParams = [...invalidParams, ...paramsFromParameterStore.invalidParams];
  requiredParams = [varName];
};

const getEnvsFromParameterStore = async () => {
  console.time('getEnvsFromParameterStore');
  requiredParams = [];
  recievedParams = [];
  invalidParams = [];
  paramsFromParameterStore = [];
  for (const varName of envVarsFullList) {
    if (process.env[varName] !== undefined) continue;
    if (requiredParams.length < 10) {
      requiredParams.push(varName);
      continue;
    }
    await recieveParams(varName);
  }
  if (requiredParams.length) {
    await recieveParams();
  }

  if (process.env.NODE_ENV !== 'production') {
    invalidParams = invalidParams.filter((param) => !productionOnly.includes(param.substring(param.lastIndexOf('/') + 1)));
  }

  for (const param of recievedParams) {
    const paramName = param.name.substring(param.name.lastIndexOf('/') + 1);
    process.env[paramName] = param.value;
  }

  const newConfig = getConfig();
  const copyKeys = (target, source, defaultSource) => {
    for (const key in target) {
      if (target[key] === undefined) target[key] = source[key] || defaultSource[key];
      else if ((typeof target[key]) === 'object' && !Array.isArray(target[key])) {
        copyKeys(target[key], source[key], defaultSource[key]);
      }
    }
  };
  copyKeys(config, newConfig, defaultConfig);
  console.timeEnd('getEnvsFromParameterStore');
  config.receivedEnvsFromParameterStore = true;
  return { recievedParams: recievedParams.map((param) => param.name), invalidParams };
};

config.getEnvsFromParameterStore = getEnvsFromParameterStore;

module.exports = config;
