/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/order */
const cors = require('cors');

const config = require('../config').app;
const logger = require('../helpers/logger');
const chargeForProject = require('../helpers/chargeForProject');

const stripe = require('stripe')(config.stripeSecret);
const router = require('express').Router();

const ProjectModel = require('../models/project');
const UserModel = require('../models/user');

router.use(cors());

const stripeEventHandlers = {

  // On now_plan subscription selection
  'customer.subscription.created': async (req, res) => {
    const subscription = req.body.data.object;
    const projectId = subscription.metadata && subscription.metadata.projectId;

    if (!projectId) {
      logger.warn(`Subscription ${subscription.id} doesnt have metadata.projectId`);
      return res.sendStatus(200);
    }

    const project = await ProjectModel.findById(projectId);

    if (!project) {
      logger.warn(`Subscription ${subscription.id} points to unexisting subscription ${projectId}`);
      return res.sendStatus(200);
    }

    const oldSubscription = project.stripe_subscription_id;
    project.plan = 'now_plan';
    project.payment_configured_at = new Date();
    project.stripe_subscription_id = subscription.id;
    project.finished_at = undefined;
    await project.save();

    if (oldSubscription) {
      await stripe.subscriptions.del(oldSubscription).catch(() => null);
      logger.warn(`Project's ${projectId} subscription ${oldSubscription} replaced with ${subscription.id}`);
    }

    res.sendStatus(200);
  },

  // On now_plan subscription status changes
  'customer.subscription.updated': async (req, res) => {
    const subscription = req.body.data.object;

    const project = await ProjectModel.findOneAndUpdate(
      { stripe_subscription_id: subscription.id },
      { is_payment_active: ['active', 'trialing'].includes(subscription.status) },
    );

    if (!project) {
      logger.warn(`Project with subscription ${subscription.id} was not found`);
    }

    res.sendStatus(200);
  },

  // On now_plan subscription deletion
  'customer.subscription.deleted': async (req, res) => {
    const subscription = req.body.data.object;

    const project = await ProjectModel.findOneAndUpdate(
      { stripe_subscription_id: subscription.id },
      { is_payment_active: false, stripe_subscription_id: '', plan: '' },
    );

    if (!project) {
      logger.warn(`Project with subscription ${subscription.id} was not found`);
    }

    res.sendStatus(200);
  },

  // On later_plan subscription selection
  'setup_intent.succeeded': async (req, res) => {
    const setupIntent = req.body.data.object;
    const projectId = setupIntent.metadata && setupIntent.metadata.projectId;

    if (!projectId) {
      logger.warn(`Setup Intent ${setupIntent.id} doesnt have metadata.projectId`);
      return res.sendStatus(200);
    }

    const project = await ProjectModel.findById(projectId);

    if (!project) {
      logger.warn(`Setup Intent ${setupIntent.id} points to unexisting subscription ${projectId}`);
      return res.sendStatus(200);
    }

    project.plan = 'later_plan';
    project.is_payment_active = true;
    project.payment_configured_at = new Date();
    project.stripe_payment_method_id = setupIntent.payment_method;
    project.finished_at = undefined;
    await project.save();

    res.sendStatus(200);
  },

  // On later_plan payment success
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
        project.stripe_payment_method_id = '';
        project.plan = '';
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
          project.stripe_payment_method_id = '';
          project.plan = '';
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

  // On later_plan payment fail
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

  'payment_intent.created': async (req, res) => {
    try {
      const paymentIntent = req.body.data.object;
      const projectId = paymentIntent.metadata.project_id;
      if (!projectId) return res.sendStatus(200);

      const result = await ProjectModel.findByIdAndUpdate(
        projectId,
        { $push: { payment_intent_ids: paymentIntent.id } },
      );
      if (!result) throw new Error(`Project ${projectId} not found`);
      res.sendStatus(200);
    } catch (err) {
      logger.error(err);
      res.sendStatus(200);
    }
  },
};

router.post('/stripe', async (req, res) => {
  logger.info(req.body.type);
  const handler = stripeEventHandlers[req.body.type];
  if (handler) await handler(req, res);
});

module.exports = router;
