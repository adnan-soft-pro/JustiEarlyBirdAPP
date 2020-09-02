/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable import/order */
const config = require('../config').app;
const logger = require('../helpers/logger');
const { mapAsyncInSlices } = require('../helpers/mapAsync');

const stripe = require('stripe')(config.stripeSecret);
const router = require('express').Router();
router.use(require('cors')());

const { exist_setIdKey, ownerOnly } = require('../middleware/projects');

const exist = exist_setIdKey('project_id');

router.post('/:project_id/now_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { user, project } = req;

    const reason400 = null
      || (project.plan && 'Project already has a plan')
      || (project.stripe_subscription_id && 'Project Already Has a Subscription')
      || (project.stripe_payment_method_id && 'Project Already Has a Payment Method');

    if (reason400) return res.status(400).send(reason400);

    // ! Create stripe checkout session in subscription mode
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: user.stripe_id,
      client_reference_id: project.id,
      line_items: [
        {
          price: user.ref_code
            ? config.nowPlanPriceIdWithCode : config.nowPlanPriceId,
          quantity: 1,
        }],
      subscription_data: {
        trial_from_plan: false,
        metadata: {
          projectId: project.id,
          projectName: project.display_name,
        },
      },
      success_url: `${config.frontendURL}/myprojects`,
      cancel_url: `${config.frontendURL}/myprojects`,
    });

    res.send({ sessionId: session.id });
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.post('/:project_id/later_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { user, project } = req;

    const reason400 = null
      || (project.plan && 'Project Already Has a Plan')
      || (project.stripe_subscription_id && 'Project Already Has a Subscription')
      || (project.stripe_payment_method_id && 'Project Already Has a Payment Method');

    if (reason400) return res.status(400).send(reason400);

    //! Create stripe checkout session in setup mode
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer: user.stripe_id,
      client_reference_id: project.id,
      setup_intent_data: {
        metadata: {
          projectId: project.id,
          projectName: project.display_name,
        },
      },
      success_url: `${config.frontendURL}/myprojects`,
      cancel_url: `${config.frontendURL}/myprojects`,
    });

    res.send({ sessionId: session.id });
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.put('/:project_id/later_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { user, project } = req;

    if (project.plan !== 'later_plan') {
      return res.status(400).send("Project doesn't have a later_plan");
    }

    //! Create stripe checkout session in setup mode
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer: user.stripe_id,
      client_reference_id: project.id,
      setup_intent_data: {
        metadata: {
          projectId: project.id,
          projectName: project.display_name,
        },
      },
      success_url: `${config.frontendURL}/myprojects`,
      cancel_url: `${config.frontendURL}/myprojects`,
    });

    res.send({ sessionId: session.id });
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.put('/:project_id/now_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { user, project } = req;

    if (project.plan !== 'now_plan') {
      return res.send(400).send("Project does't have a now_plan");
    }

    let trialEnd;
    if (!project.stripe_subscription_id) trialEnd = Date.now();
    else {
      trialEnd = await stripe.subscriptions.retrieve(project.stripe_subscription_id)
        .then((subscription) => subscription.trial_end)
        .catch(() => Date.now());
    }

    // ! Create stripe checkout session in subscription mode
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: user.stripe_id,
      client_reference_id: project.id,
      line_items: [{ price: config.nowPlanPriceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          projectId: project.id,
          projectName: project.display_name,
        },
        trial_end: trialEnd,
      },
      success_url: `${config.frontendURL}/myprojects`,
      cancel_url: `${config.frontendURL}/myprojects`,
    });

    res.send({ sessionId: session.id });
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/:project_id/now_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    if (req.project.plan !== 'now_plan') return res.status(400).send("Project doesn't have a now_plan");
    const subscription = await stripe.subscriptions.retrieve(req.project.stripe_subscription_id, { expand: ['default_payment_method'] });
    const { data: invoices } = await stripe.invoices.list({ subscription: subscription.id });

    subscription.payment_intents = await mapAsyncInSlices(
      invoices, 10,
      (i) => stripe.paymentIntents.retrieve(i.payment_intent).catch(() => null),
    );

    subscription.payment_intents = subscription.payment_intents.filter((pi) => pi);
    subscription.default_payment_method = {
      created: subscription.default_payment_method.created,
      card: {
        last4: subscription.default_payment_method.card.last4,
      },
    };

    return res.send(subscription);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/:project_id/later_plan', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;
    if (project.plan !== 'later_plan') return res.status(400).send("Project doesn't have a later_plan");

    const response = { payment_intents: { object: 'list' } };

    response.default_payment_method = await stripe.paymentMethods
      .retrieve(project.stripe_payment_method_id)
      .catch(() => null);

    if (response.default_payment_method) {
      response.default_payment_method = {
        created: response.default_payment_method.created,
        card: {
          last4: response.default_payment_method.card.last4,
        },
      };
    }

    response.payment_intents.data = await mapAsyncInSlices(
      project.payment_intent_ids, 10,
      (piid) => stripe.paymentIntents.retrieve(piid).catch(() => null),
    );

    response.payment_intents.data = response.payment_intents.data.filter((pi) => pi);

    return res.send(response);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
