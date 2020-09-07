/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/order */
const cors = require('cors');
const moment = require('moment');
const config = require('../config').app;
const logger = require('../helpers/logger');
const chargeForProject = require('../helpers/chargeForProject');

const stripe = require('stripe')(config.stripeSecret);
const router = require('express').Router();

const ProjectModel = require('../models/project');
const UserModel = require('../models/user');
const sendAnalytics = require('../helpers/googleAnalyticsSend');
const bot = require('../bot/index');
const mixpanelAnalytics = require('../helpers/mixpanelAnalytics');

router.use(cors());
const finishTrial = async (user) => {
  await ProjectModel.updateMany(
    { user_id: user._id },
    { is_trialing: false },
  );
};

const paymentInformationMessage = async (project, product) => {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'test') {
    const user = await UserModel.findById(project.user_id);
    // const product = process.env.NODE_ENV === 'production' ? 'JEB' : 'JEB Staging';
    const cfplatform = project.site_type === 'KS' ? 'Kickstarter' : 'Indiegogo';
    const utcMoment = moment.utc().format('DD-MM-YYYY/hh-mm UTC');
    bot.sendMessage(`A user using the email ${user.email} has successfully added a payment method for his ${cfplatform} project on ${product} for the campaign ${project.url} at ${utcMoment}.`);
  }
};

const realPaymentMessage = async (project, amount, product) => {
  const user = await UserModel.findById(project.user_id);
  // const product = process.env.NODE_ENV === 'production' ? 'JEB' : 'JEB Staging';
  const cfplatform = project.site_type === 'KS' ? 'Kickstarter' : 'Indiegogo';
  const utcMoment = moment.utc().format('DD-MM-YYYY/hh-mm UTC');
  bot.sendMessage(`A user using the email ${user.email} has made a payment of ${+amount / 100}$ at ${utcMoment}. This is regarding his ${cfplatform} project on ${product} which is promoting the campaign ${project.url}.`);
};

const findUserToMixpanel = async (project, event) => {
  const user = await UserModel.findById(project.user_id);
  mixpanelAnalytics.currentUser(
    user._id,
    user.fullname,
    user.email,
    user.stripe_id,
    user.is_admin,
    user.location,
    user.timezone,
    user.is_suspended,
    false,
    true,
  );
  if (event === 'saved-payment-now-10') {
    mixpanelAnalytics.currEvent(user._id, 'Saved payment stripe', 'saved-payment-stripe', 'saved-payment-now-10', 'Save Payment Now 10 per day');
  }
  if (event === 'saved-payment-later-15') {
    mixpanelAnalytics.currEvent(user._id, 'Saved payment stripe', 'saved-payment-stripe', 'saved-payment-later-15', 'Save Payment Later 15 per day');
  }
  if (event === 'trial-started-prod') {
    mixpanelAnalytics.currEvent(user._id, 'Trial started on production', 'trial-status', 'trial-started-prod', 'Trial started on production 3 days');
  }
  if (event === 'trial-started-staging') {
    mixpanelAnalytics.currEvent(user._id, 'Trial started on staging', 'trial-status', 'trial-started-staging', 'Trial ended on staging 1 day');
  }
  if (event === 'trial-ended-prod') {
    mixpanelAnalytics.currEvent(user._id, 'Trial ended on production', 'trial-status', 'trial-ended-prod', 'Trial ended on production 3 days');
  }
  if (event === 'trial-ended-staging') {
    mixpanelAnalytics.currEvent(user._id, 'Trial ended on staging', 'trial-status', 'trial-ended-staging', 'Trial ended on staging 1 day');
  }
  /// //////////////
  if (event === 'payment-received-stripe') {
    mixpanelAnalytics.currEvent(user._id, 'Trial ended on staging', 'payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
  }
};

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
    project.is_payment_active = true;
    project.stripe_subscription_id = subscription.id;
    project.finished_at = undefined;
    const user = await UserModel.findById(project.user_id);
    if (user && user.is_trial) {
      finishTrial(user);
      user.is_trial = false;
      await user.save();
    }

    sendAnalytics('saved-payment-stripe', 'saved-payment-now-10', 'Save Payment Now 10 per day');
    findUserToMixpanel(project, 'saved-payment-now-10');
    if (process.env.NODE_ENV === 'production') {
      paymentInformationMessage(project, 'JEB');
      sendAnalytics('trial-status', 'trial-started-prod', 'Trial started on production 3 days');
      findUserToMixpanel(project, 'trial-started-prod');
    } else if (process.env.NODE_ENV === 'staging') {
      paymentInformationMessage(project, 'JEB Staging');
      sendAnalytics('trial-status', 'trial-started-staging', 'Trial started on staging 1 day');
      findUserToMixpanel(project, 'trial-started-staging');
    }

    // sendAnalytics('user-sign-up', 'signed-up-native', 'New user signed up Natively');
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

    project.is_payment_active = ['active', 'trialing'].includes(subscription.status);
    project.debt = ['active', 'trialing', 'canceled'].includes(subscription.status) ? 0 : 15;
    if (project.is_trialing && !subscription.status === 'trialing') {
      if (process.env.NODE_ENV === 'production') {
        findUserToMixpanel(project, 'trial-ended-prod');
        sendAnalytics('trial-status', 'trial-ended-prod', 'Trial ended on production 3 days');
      } else if (process.env.NODE_ENV === 'staging') {
        findUserToMixpanel(project, 'trial-ended-staging');
        sendAnalytics('trial-status', 'trial-ended-staging', 'Trial ended on staging 1 day');
      }
    }
    project.is_trialing = subscription.status === 'trialing';
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
    project.plan = undefined;
    project.total_billing_time += (new Date() - project.last_billing_started_at) || 0;
    project.last_billing_started_at = undefined;
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

    project.plan = 'later_plan';
    project.is_payment_active = true;
    project.payment_configured_at = new Date();
    project.stripe_payment_method_id = setupIntent.payment_method;
    project.finished_at = undefined;
    const user = await UserModel.findById(project.user_id);
    if (user && user.is_trial) {
      finishTrial(user);
      user.is_trial = false;
      await user.save();
    }
    sendAnalytics('saved-payment-stripe', 'saved-payment-later-15', 'Save Payment Later 15 per day');
    findUserToMixpanel(project, 'saved-payment-later-15');
    if (process.env.NODE_ENV === 'production') {
      paymentInformationMessage(project, 'JEB');
      sendAnalytics('trial-status', 'trial-started-prod', 'Trial started on production 3 days');
      findUserToMixpanel(project, 'trial-started-prod');
    } else if (process.env.NODE_ENV === 'staging') {
      paymentInformationMessage(project, 'JEB Staging');
      sendAnalytics('trial-status', 'trial-started-staging', 'Trial started on staging 1 day');
      findUserToMixpanel(project, 'trial-started-staging');
    }

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
      sendAnalytics('Now Plan', 'Payment Success', 'Now Plan Payment Success');
      if (process.env.NODE_ENV === 'production') {
        realPaymentMessage(project, paymentIntent.amount_received, 'JEB');
        sendAnalytics('payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
        findUserToMixpanel(project, 'payment-received-stripe');
      } else if (process.env.NODE_ENV === 'staging') {
        realPaymentMessage(project, paymentIntent.amount_received, 'JEB Staging');
        sendAnalytics('payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
        findUserToMixpanel(project, 'payment-received-stripe');
      }
      return res.sendStatus(200);
    }

    if (paymentIntent.amount_received === project.debt) {
      project.initial_debt = 0;
    }
    project.debt -= paymentIntent.amount_received;

    switch (project.charge_flow_status) {
      case ('/1'): {
        project.charge_flow_status = 'done';
        project.stripe_payment_method_id = '';
        project.plan = undefined;
        await project.save();
        logger.info(`Project ${projectId} is fully paid (/1)`);
        sendAnalytics('Later Plan', 'Payment Success', 'Later Plan Payment Success');
        if (process.env.NODE_ENV === 'production') {
          realPaymentMessage(project, paymentIntent.amount_received, 'JEB');
          sendAnalytics('payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
          findUserToMixpanel(project, 'payment-received-stripe');
        } else if (process.env.NODE_ENV === 'staging') {
          realPaymentMessage(project, paymentIntent.amount_received, 'JEB Staging');
          sendAnalytics('payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
          findUserToMixpanel(project, 'payment-received-stripe');
        }
        break;
      }
      case ('/2'): {
        project.charge_flow_status = '/4';
        await project.save();
        logger.info(`Project ${projectId} is partially paid (/2)`);
        await chargeForProject(project, user);
        sendAnalytics('Later Plan', 'Payment Success', 'Later Plan Payment Success');
        if (process.env.NODE_ENV === 'production') {
          realPaymentMessage(project, paymentIntent.amount_received, 'JEB');
          sendAnalytics('payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
          findUserToMixpanel(project, 'payment-received-stripe');
        } else if (process.env.NODE_ENV === 'staging') {
          realPaymentMessage(project, paymentIntent.amount_received, 'JEB Staging');
          sendAnalytics('payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
          findUserToMixpanel(project, 'payment-received-stripe');
        }
        break;
      }
      case ('/4'): {
        if (project.debt === 0) {
          project.charge_flow_status = 'done';
          project.stripe_payment_method_id = '';
          project.plan = undefined;
          sendAnalytics('Later Plan', 'Payment Success', 'Later Plan Payment Success');
          if (process.env.NODE_ENV === 'production') {
            realPaymentMessage(project, paymentIntent.amount_received, 'JEB');
            sendAnalytics('payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
            findUserToMixpanel(project, 'payment-received-stripe');
          } else if (process.env.NODE_ENV === 'staging') {
            realPaymentMessage(project, paymentIntent.amount_received, 'JEB Staging');
            sendAnalytics('payment-received', 'payment-received-stripe', 'Payment Received on Stripe');
            findUserToMixpanel(project, 'payment-received-stripe');
          }
        }
        await project.save();
        logger.info(`Project ${projectId} is ${project.debt === 0 ? 'fully' : 'partially'} paid (/4)`);
        break;
      }
      default: {
        logger.warn(`PaymentIntent ${paymentIntent.id} points to the project ${projectId} with charge_flow_status ${project.charge_flow_status}`);
        await project.save();
      }
    }
    // if (!project.charge_flow_status || project.charge_flow_status === 'not_needed') {
    // }
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

    if (project.plan !== 'later_plan') {
      sendAnalytics('Now Plan', 'Payment Failed', 'Now Plan Payment Failed');
      return res.sendStatus(200);
    }

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
        sendAnalytics('Later Plan', 'Payment Failed', 'Later Plan Payment Failed');
        break;
      }
      case ('/2'): {
        project.charge_flow_status = '/4';
        await project.save();
        logger.info(`/2 PaymentIntent for project ${projectId} failed`);
        await chargeForProject(project, user);
        sendAnalytics('Later Plan', 'Payment Failed', 'Later Plan Payment Failed');
        break;
      }
      case ('/4'): {
        await project.save();
        logger.info(`/4 PaymentIntent for project ${projectId} failed`);
        sendAnalytics('Later Plan', 'Payment Failed', 'Later Plan Payment Failed');
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
      if (paymentIntent.invoice) {
        const invoice = await stripe.invoices.retrieve(
          paymentIntent.invoice,
          { expand: ['subscription'] },
        );
        paymentIntent.metadata = invoice.subscription.metadata;
      }

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
