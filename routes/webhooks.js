/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/order */
const cors = require('cors');
const router = require('express').Router();

const logger = require('../helpers/logger');

const ProjectModel = require('../models/project');

router.use(cors());

const stripeEventHandlers = {

  'customer.subscription.updated': async (req, res) => {
    const subscription = req.body.data.object;

    const project = await ProjectModel.findOneAndUpdate(
      { stripe_subscription_id: subscription.id },
      { is_active: subscription.status === 'active' },
    ).exec();

    res.sendStatus(project ? 200 : 400);
  },

  'customer.subscription.deleted': async (req, res) => {
    const subscription = req.body.data.object;

    const project = await ProjectModel.findOneAndUpdate(
      { stripe_subscription_id: subscription.id },
      { is_active: false, stripe_subscription_id: '' },
    ).exec();

    if (!project) logger.warn(`Project with subscription:${subscription.id} was not found`);
    res.sendStatus(200);
  },

};

router.post('/stripe', async (req, res) => {
  logger.info(req.body.type);
  const handler = stripeEventHandlers[req.body.type];
  if (handler) await handler(req, res);
});

module.exports = router;
