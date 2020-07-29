/* eslint-disable import/order */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */
const router = require('express').Router();

const config = require('../config/index').app;
const stripe = require('stripe')(config.stripeSecret);
const logger = require('../helpers/logger');
const { mapAsync } = require('../helpers/mapAsync');
const ProjectModel = require('../models/project');
const UserModel = require('../models/user');

router.get('/users', async (req, res, next) => {
  try {
    const users = (await UserModel.find()).map((user) => user._doc);

    await mapAsync(users, async (user) => {
      user.projects = await ProjectModel.find({ user_id: user._id });

      user.owedAmount = user.projects.reduce((sum, p) => sum + (p.debt || 0), 0);
      user.paidAmount = user.projects.reduce((sum, u) => sum + (u.total_paid || 0), 0);
    });

    res.send(users);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});
module.exports = router;
