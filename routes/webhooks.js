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
    const project = await ProjectModel.findOne({ stripe_subscription_id: subscription.id });
    if (!project) {
      logger.warn(`Project with subscription ${subscription.id} was not found`);
      return res.sendStatus(200);
    }

    if (!project.is_payment_active && subscription.status === 'active') {
      project.total_billing_time += new Date() - project.last_billing_started_at;
    }
    project.is_payment_active = ['active', 'trialing'].includes(subscription.status);
    project.debt = ['active', 'trialing', 'canceled'].includes(subscription.status) ? 0 : 15;
    await project.save();

    res.sendStatus(200);
  },

  // On now_plan subscription deletion
  'customer.subscription.deleted': async (req, res) => {
    const subscription = req.body.data.object;

    const project = await ProjectModel.findOne(
      { stripe_subscription_id: subscription.id },
    );

    if (!project) {
      logger.warn(`Project with subscription ${subscription.id} was not found`);
      return res.sendStatus(200);
    }

    project.is_payment_active = false;
    project.stripe_subscription_id = '';
    project.plan = '';
    project.total_billing_time += new Date() - project.last_billing_started_at;

    await project.save();

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

    project.last_billing_started_at = new Date();
    project.total_billing_time -= (+config.trialPeriodLaterPlan);
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

    if (paymentIntent.invoice) {
      const invoice = await stripe.invoices.retrieve(
        paymentIntent.invoice,
        { expand: ['subscription'] },
      );
      paymentIntent.metadata = invoice.subscription.metadata;
    }

    const { projectId } = paymentIntent.metadata;
    const project = await ProjectModel.findById(projectId);

    if (!project) {
      logger.warn(`PaymentIntent ${paymentIntent.id} points to not existing project ${projectId}`);
      return res.sendStatus(200);
    }

    const user = await UserModel.findById(project.user_id);

    if (!user) {
      logger.warn(`PaymentIntent ${paymentIntent.id} points to project ${projectId} with not existing user ${project.user_id}`);
      return res.sendStatus(200);
    }

    project.total_paid += paymentIntent.amount_received;
    project.last_charge_attempt_at = new Date();

    if (project.plan === 'now_plan') {
      await project.save();
      return res.sendStatus(200);
    }

    project.debt -= paymentIntent.amount_received;

    switch (project.charge_flow_status) {
      case ('/1'): {
        project.charge_flow_status = 'done';
        project.stripe_payment_method_id = '';
        project.plan = undefined;
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
          project.plan = undefined;
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

    if (paymentIntent.metadata.suspendChargeFlow) {
      return res.sendStatus(200);
    }

    const { projectId } = paymentIntent.metadata;
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
      const { projectId } = paymentIntent.metadata;

      if (!projectId) {
        logger.warn(`Payment Intent ${paymentIntent.id} doesnt have metadata.projectId`);
        return res.sendStatus(200);
      }

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
