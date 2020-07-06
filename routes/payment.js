/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable import/order */
const config = require('../config');
const logger = require('../helpers/logger');

const stripe = require('stripe')(config.app.stripeSecret);
const router = require('express').Router();
router.use(require('cors')());

const { exist_setIdKey, ownerOnly } = require('../middleware/projects');

const exist = exist_setIdKey('project_id');

const nowPlanId = 'price_1H1xAbCjtqMrYRFfJJLLJNJz';
router.post('/:project_id/now_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { user, project } = req;
    const paymentMethodId = req.body.payment_method;

    if (!paymentMethodId) return res.status(400).send('payment_method is required');
    if (project.stripe_subscription_id || project.stripe_payment_method_id) {
      return res.status(400).send('Project Already Has a Subscription or a Payment Method');
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: user.stripe_id });
    } else if (paymentMethod.customer !== user.stripe_id) {
      return res.status(400).send('This payment_method doesn\'t belong to the current user');
    }

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: user.stripe_id,
      items: [{ plan: nowPlanId }],
      expand: ['latest_invoice.payment_intent'],
      trial_from_plan: true,
      default_payment_method: paymentMethodId,
      metadata: { project_id: project.id },
    });

    // Update the project
    project.stripe_subscription_id = subscription.id;
    project.plan = 'now_plan';
    project.is_payment_active = true;

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.post('/:project_id/later_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { user, project } = req;
    const paymentMethodId = req.body.payment_method;

    if (!paymentMethodId) return res.status(400).send('payment_method is required');
    if (project.stripe_subscription_id || project.stripe_payment_method_id) {
      return res.status(400).send('Project Already Has a Subscription or a Payment Method');
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: user.stripe_id });
      await stripe.setupIntents.create({
        confirm: true,
        customer: user.stripe_id,
        usage: 'off_session',
        payment_method: paymentMethodId,
      });
    } else if (paymentMethod.customer !== user.stripe_id) {
      return res.status(400).send('This payment_method doesn\'t belong to the current user');
    }

    project.is_payment_active = true;
    project.stripe_payment_method_id = paymentMethodId;
    project.plan = 'later_plan';

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.delete('/:project_id/now_plan', exist, ownerOnly, async (req, res) => {
  try {
    const { project } = req;

    if (!project.stripe_subscription_id) return res.status(400).send('Project Has No Subscription');

    // Cancel the subscription (Webhook will handle the rest of the logic)
    stripe.subscriptions.del(project.stripe_subscription_id);
  } catch (err) {
    logger.error(err);
    res.status(500).send(err.reason ? err.reason.message : err.message);
  }
});

router.put('/:project_id/later_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { user, project } = req;
    const paymentMethodId = req.body.payment_method;

    const reason400 = null
      || (project.plan !== 'later_plan' && 'Project does\'t have a later_plan')
      || (!paymentMethodId && 'payment_method is required')
      || (project.stripe_payment_method_id === paymentMethodId && 'Project already has this PaymentMethod');
    if (reason400) return res.send(400).send(reason400);

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: user.stripe_id });
      await stripe.setupIntents.create({
        confirm: true,
        customer: user.stripe_id,
        usage: 'off_session',
        payment_method: paymentMethodId,
      });
    } else if (paymentMethod.customer !== user.stripe_id) {
      return res.status(400).send('This payment_method doesn\'t belong to the current user');
    }

    project.stripe_payment_method_id = paymentMethodId;

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.put('/:project_id/now_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { user, project } = req;
    const paymentMethodId = req.body.payment_method;

    const reason400 = null
      || (project.plan !== 'now_plan' && 'Project does\'t have a now_plan')
      || (!paymentMethodId && 'payment_method is required');
    if (reason400) return res.send(400).send(reason400);

    const subscription = await stripe.subscriptions.retrieve(project.stripe_subscription_id);
    if (subscription.default_payment_method === paymentMethodId) {
      return res.send(400).send('Subscription already uses this payment_method');
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: user.stripe_id });
    } else if (paymentMethod.customer !== user.stripe_id) {
      return res.status(400).send('This payment_method doesn\'t belong to the current user');
    }

    await stripe.subscriptions.update(subscription.id, { default_payment_method: paymentMethodId });

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/:project_id/now_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    if (req.project.plan !== 'now_plan') return res.status(400).send("Project doesn't have a now_plan");
    const subscription = await stripe.subscriptions.retrieve(req.project.stripe_subscription_id, { expand: ['default_payment_method'] });
    subscription.invoices = await stripe.invoices.list({ subscription: subscription.id });
    return res.send(subscription);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
