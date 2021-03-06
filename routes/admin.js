/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable import/order */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */
const router = require('express').Router();

const { exist_setIdKey } = require('../middleware/projects');

const projectExist = exist_setIdKey('id');
const config = require('../config/index').app;
const stripe = require('stripe')(config.stripeSecret);
const logger = require('../helpers/logger');
const deleteProjectFromDynamo = require('../helpers/deleteDynamoData');
const startChargeFlow = require('../helpers/startChargeFlow');
const { mapAsync } = require('../helpers/mapAsync');
const ProjectModel = require('../models/project');
const UserModel = require('../models/user');
const RewardModel = require('../models/reward');
const RewardChangeLog = require('../models/reward_change_log');

router.get('/users', async (req, res, next) => {
  try {
    const users = (await UserModel.find()).map((user) => user._doc);

    await mapAsync(users, async (user) => {
      user.projects = await ProjectModel.find({ user_id: user._id });
      user.owedAmount = user.projects.reduce((sum, p) => sum + (p.debt || 0), 0);
      user.paidAmount = user.projects.reduce((sum, p) => sum + (p.total_paid || 0), 0);
    });

    res.send(users);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/user/:id', async (req, res, next) => {
  try {
    const { _doc: user } = await UserModel.findById(req.params.id);

    user.projects = await ProjectModel.find({ user_id: user._id });
    user.projects.forEach((project) => {
      if (project.last_billing_started_at === undefined) return 0;
      if (project.is_active && project.credentials) {
        project.total_billing_time = +project.total_billing_time
        + +(new Date() - project.last_billing_started_at) || 0;
      }
    });

    res.send(user);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.post('/user/suspend/:id', async (req, res, next) => {
  try {
    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { is_suspended: req.body.suspend },
      { new: true },
    );

    res.send(user);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.post('/project/suspend/:id', projectExist, async (req, res, next) => {
  try {
    const project = await ProjectModel.findByIdAndUpdate(
      req.params.id,
      { is_suspended: req.body.suspend },
      { new: true },
    );

    res.send(project);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.delete('/project/:id', projectExist, async (req, res, next) => {
  try {
    const project = await ProjectModel.findById(req.params.id);
    await RewardModel.deleteMany({ project_id: project._id });
    await RewardChangeLog.deleteMany({ project_id: project._id });

    if (project.plan === 'now_plan') {
      if (project.stripe_subscription_id) {
        await stripe.subscriptions.del(project.stripe_subscription_id);
      }
    }
    await deleteProjectFromDynamo(req.params.id);
    await req.project.deleteOne();

    res.send({ message: 'Project successfully deleted' }).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.delete('/user/:id', async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id);
    await user.remove();
    const projects = (await ProjectModel
      .find({ user_id: user._id })
    ).map((project) => project._doc);

    await mapAsync(projects, async (project) => {
      await RewardModel.deleteMany({ project_id: project._id });
      await RewardChangeLog.deleteMany({ project_id: project._id });
      if (project.plan === 'now_plan') {
        if (project.stripe_subscription_id) {
          await stripe.subscriptions.del(project.stripe_subscription_id);
        }
      }
      await deleteProjectFromDynamo(project._id).catch(() => {});
      await ProjectModel.findByIdAndRemove(project._id);
    });

    res.send({ message: 'User successfully deleted' }).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.post('/project/:id/pay', projectExist, async (req, res, next) => {
  try {
    const { project } = req;

    const reason400 = null
      || (project.plan !== 'later_plan' && "Project doesn't have later_plan")
      || (!project.finished_at && 'Project is not finished yet')
      || (project.charge_flow_status !== 'scheduled' && 'Charge flow is already started for this project');

    if (reason400) return res.status(400).send(reason400);

    const charge_flow_started = await startChargeFlow(project);
    res.send({ charge_flow_started });
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
