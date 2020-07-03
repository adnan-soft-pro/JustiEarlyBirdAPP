/* eslint-disable import/order */
/* eslint-disable no-param-reassign */
const config = require('../config').app;
const logger = require('./logger');

const stripe = require('stripe')(config.stripeSecret);

const UserModel = require('../models/user');

module.exports = async (project, user = null) => {
  if (!user) user = await UserModel.findById(project.user_id);
  if (
    !project.stripe_payment_method_id
    || project.charge_flow_status !== 'scheduled'
    || !project.stripe_payment_method_id
    || project.plan !== 'later_plan'
    || !user || !user.stripe_id
  ) {
    logger.warn(`Unable to perform Initial Charge Flow for project ${project.id}`);
    return false;
  }

  project.charge_flow_status = '/1';
  await project.save();

  try {
    await stripe.charges.create({
      customer: user.stripe_id,
      source: project.stripe_payment_method_id,
      amount: project.initial_debt,
      currency: 'usd',
      description: `project ${project.id}`,
    });
  } catch (err) {
    project.charge_flow_status = 'scheduled';
    await project.save();
    return false;
  }

  return true;
};
