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
    const user = (await UserModel.findById(req.params.id)).map((u) => u._doc);

    user.projects = await ProjectModel.find({ user_id: user._id });

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
      { is_suspended: true },
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
      { is_suspended: true },
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
    await RewardModel.remove({ project_id: project._id });
    await RewardChangeLog.remove({ project_id: project._id });

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

// router.delete('/user/:id', async (req, res, next) => {
//   try {

//     const project = await ProjectModel.findById(req.params.id);
//     await RewardModel.remove({ project_id: project._id });
//     await RewardChangeLog.remove({ project_id: project._id });

//     if (project.plan === 'now_plan') {
//       if (project.stripe_subscription_id) {
//         await stripe.subscriptions.del(project.stripe_subscription_id);
//       }
//     }
//     await deleteProjectFromDynamo(req.params.id);
//     await req.project.deleteOne();

//     res.send({ message: 'Project successfully deleted' }).status(200);
//   } catch (err) {
//     logger.error(err);
//     next(new Error(err));
//   }
// });

module.exports = router;
