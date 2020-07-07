/* eslint-disable import/order */
/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
/* eslint-disable consistent-return */
const router = require('express').Router();
const logger = require('../helpers/logger');

const RewardModel = require('../models/reward');
const ProjectModel = require('../models/project');
const RewardChangeLogModel = require('../models/reward_change_log');

router.put('/:id', async (req, res, next) => {
  try {
    const { user } = req;

    const reward = await RewardModel.findById(req.params.id);
    const project = await ProjectModel.findById(reward.project_id);
    if (!reward) return res.status(404).send('Reward not found');
    if (project.user_id !== user.id) return res.status(403).send('Reward Doesn\'t Belong To This User');

    await RewardModel.findByIdAndUpdate(req.params.id, req.body);

    res.send(await RewardModel.findById(req.params.id).exec());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    res.send(await RewardChangeLogModel.find({ reward_id: req.params.id }).exec());
  } catch {
    res.sendStatus(500);
  }
});

module.exports = router;
