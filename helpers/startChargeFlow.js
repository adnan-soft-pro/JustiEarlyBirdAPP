/* eslint-disable import/order */
/* eslint-disable no-param-reassign */
const config = require('../config').app;
const logger = require('./logger');

const stripe = require('stripe')(config.stripeSecret);

const UserModel = require('../models/user');

module.exports = async (project, user = null) => {
  try {
    if (!user) user = await UserModel.findById(project.user_id);
    if (
      !project.stripe_payment_method_id
    || project.charge_flow_status !== 'scheduled'
    || !project.stripe_payment_method_id
    || project.plan !== 'later_plan'
    || !user || !user.stripe_id
    ) {
      throw new Error('Object is invalid');
    }

    project.charge_flow_status = '/1';
    await project.save();

    await stripe.charges.create({
      customer: user.stripe_id,
      source: project.stripe_payment_method_id,
      amount: project.initial_debt,
      currency: 'usd',
      description: `project ${project.id}`,
    });

    logger.info(`Started charge flow for project ${project.id}`);
    return true;
  } catch (err) {
    logger.error(`Couldn't start charge flow for project (${err})`);
    project.charge_flow_status = 'scheduled';
    await project.save();
    return false;
  }
};
