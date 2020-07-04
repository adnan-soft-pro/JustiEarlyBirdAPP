/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/order */
const cors = require('cors');

const logger = require('../helpers/logger');
const chargeForProject = require('../helpers/chargeForProject');

const router = require('express').Router();

const ProjectModel = require('../models/project');
const UserModel = require('../models/user');

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

  'payment_intent.succeeded': async (req, res) => {
    const paymentIntent = req.body.data.object;

    const projectId = paymentIntent.metadata.project_id;
    const project = await ProjectModel.findById(projectId);

    if (!project) {
      logger.warn(`PaymentIntent ${paymentIntent.id} points to not existing project ${projectId}`);
      return res.sendStatus(200);
    }

    if (project.plan !== 'later_plan') return res.sendStatus(200);

    const user = await UserModel.findById(project.user_id);

    if (!user) {
      logger.warn(`PaymentIntent ${paymentIntent.id} points to project ${projectId} with not existing user ${project.user_id}`);
      return res.sendStatus(200);
    }

    project.debt -= paymentIntent.amount;
    project.last_charge_attempt_at = new Date();

    switch (project.charge_flow_status) {
      case ('/1'): {
        project.charge_flow_status = 'done';
        await project.save();
        logger.info(`Project ${projectId} is fully paid (/1)`);
        break;
      }
      case ('/2'): {
        project.charge_flow_status = '/4';
        await project.save();
        logger.info(`Project ${projectId} is partially paid (/2)`);
        await chargeForProject(project, user);
        break;
      }
      case ('/4'): {
        if (project.debt === 0) {
          project.charge_flow_status = 'done';
        }
        await project.save();
        logger.info(`Project ${projectId} is ${project.debt === 0 ? 'fully' : 'partially'} paid (/4)`);
        break;
      }
      default: {
        logger.warn(`PaymentIntent ${paymentIntent.id} points to the project ${projectId} with charge_flow_status ${project.charge_flow_status}`);
      }
    }
    res.sendStatus(200);
  },

  'payment_intent.payment_failed': async (req, res) => {
    const paymentIntent = req.body.data.object;

    const projectId = paymentIntent.metadata.project_id;
    const project = await ProjectModel.findById(projectId);

    if (!project) {
      logger.warn(`PaymentIntent ${paymentIntent.id} points to not existing project ${projectId}`);
      return res.sendStatus(200);
    }

    if (project.plan !== 'later_plan') return res.sendStatus(200);

    const user = await UserModel.findById(project.user_id);

    if (!user) {
      logger.warn(`PaymentIntent ${paymentIntent.id} points to project ${projectId} with not existing user ${project.user_id}`);
      return res.sendStatus(200);
    }

    project.last_charge_attempt_at = new Date();

    switch (project.charge_flow_status) {
      case ('/1'): {
        project.charge_flow_status = '/2';
        await project.save();
        logger.info(`/1 PaymentIntent for project ${projectId} failed`);
        await chargeForProject(project, user);
        break;
      }
      case ('/2'): {
        project.charge_flow_status = '/4';
        await project.save();
        logger.info(`/2 PaymentIntent for project ${projectId} failed`);
        await chargeForProject(project, user);
        break;
      }
      case ('/4'): {
        await project.save();
        logger.info(`/4 PaymentIntent for project ${projectId} failed`);
        break;
      }
      default: {
        logger.warn(`PaymentIntent ${paymentIntent.id} points to the project ${projectId} with charge_flow_status ${project.charge_flow_status}`);
      }
    }
    res.sendStatus(200);
  },
};

router.post('/stripe', async (req, res) => {
  logger.info(req.body.type);
  const handler = stripeEventHandlers[req.body.type];
  if (handler) await handler(req, res);
});

module.exports = router;
