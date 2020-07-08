/* eslint-disable import/order */
/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
const router = require('express').Router();
const logger = require('../helpers/logger');
const { exist, projectOwnerOnly } = require('../middleware/rewards');

const RewardModel = require('../models/reward');
const RewardChangeLogModel = require('../models/reward_change_log');

router.get('/:id', exist, projectOwnerOnly, async (req, res, next) => {
  try {
    res.send(req.reward);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/:id/logs', exist, projectOwnerOnly, async (req, res, next) => {
  try {
    const { reward } = req;
    const changeLogs = await RewardChangeLogModel.find({ reward_id: reward.id }).exec();
    res.send(changeLogs);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.put('/:id', exist, projectOwnerOnly, async (req, res, next) => {
  try {
    const { reward } = req;
    await RewardModel.findByIdAndUpdate(reward.id, req.body);
    return res.send(await RewardModel.findById(reward.id));
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
