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

const nowPlanId = 'price_1H08JeA0LXUsJo5CxHH1kWkc';
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

    // Change the default invoice settings on the customer to the new payment method
    await stripe.customers.update(
      user.stripe_id,
      { invoice_settings: { default_payment_method: paymentMethodId } },
    );

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: user.stripe_id,
      items: [{ plan: nowPlanId }],
      expand: ['latest_invoice.payment_intent'],
      trial_from_plan: true,
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

module.exports = router;
