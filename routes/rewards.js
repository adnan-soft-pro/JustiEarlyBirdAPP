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
    const {
      page, limit, showLogs, projectId,
    } = req.query;
    const isUpdatedFilters = {
      Adjusted: true,
      Checked: false,
      All: { $in: [false, true] },
    };

    const countLogs = await RewardChangeLogModel
      .find({ reward_id: reward.id, is_updated: isUpdatedFilters[showLogs], project_id: projectId })
      .count()
      .exec();

    const changeLogs = await RewardChangeLogModel
      .find({ reward_id: reward.id, is_updated: isUpdatedFilters[showLogs], project_id: projectId })
      .sort({ createdAt: -1 })
      .skip((+page - 1) * (+limit))
      .limit(+limit)
      .exec();

    res.send({ changeLogs, countLogs });
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.put('/:id', exist, projectOwnerOnly, async (req, res, next) => {
  try {
    const { reward } = req;
    await RewardModel.findByIdAndUpdate(reward.id, req.body);

    res.send(await RewardModel.findById(reward.id));
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
