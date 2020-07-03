/* eslint-disable import/order */
const config = require('../config').app;
const logger = require('./logger');
const stripe = require('stripe')(config.stripeSecret);

const UserModel = require('../models/user');

const dividers = { '/1': 1, '/2': 2, '/4': 4 };

module.exports = async (project, user = null) => {
  if (!user) {
    // eslint-disable-next-line no-param-reassign
    user = await UserModel.findById();
    if (!user) {
      logger.warn(`Project ${project.id} points to not existing user ${project.user_id}`);
      return;
    }
  }

  let chargeAmount = Math.floor(project.initial_debt / dividers[project.charge_flow_status]);
  if (chargeAmount > project.debt) chargeAmount = project.debt;

  logger.info(`Attempt to charge for project ${project.id} (${project.charge_flow_status})`);

  await stripe.charges.create({
    customer: user.stripe_id,
    source: project.stripe_payment_method_id,
    amount: chargeAmount,
    currency: 'usd',
    description: `project ${project.id}`,
  });
};
