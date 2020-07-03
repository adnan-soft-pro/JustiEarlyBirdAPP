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

  'charge.succeeded': async (req, res) => {
    const charge = req.body.data.object;

    if (!charge.description || !charge.description.startsWith('project ')) {
      logger.warn(`Charge ${charge.id} containt invalid description ${charge.description}`);
      return res.sendStatus(200);
    }

    const projectId = charge.description.split(' ')[1];
    const project = await ProjectModel.findById(projectId);

    if (!project) {
      logger.warn(`Charge ${charge.id} points to not existing project ${projectId}`);
      return res.sendStatus(200);
    }

    switch (project.charge_flow_status) {
      case ('/1'): {
        project.debt -= charge.amount;
        project.charge_flow_status = 'done';
        await project.save();
        break;
      }
      default: {
        logger.warn(`Charge ${charge.id} points to project ${projectId} with charge_flow_status ${project.charge_flow_status}`);
      }
    }
    res.sendStatus(200);
  },

  'charge.failed': async (req, res) => res.sendStatus(200),
};

router.post('/stripe', async (req, res) => {
  logger.info(req.body.type);
  const handler = stripeEventHandlers[req.body.type];
  if (handler) await handler(req, res);
});

module.exports = router;
