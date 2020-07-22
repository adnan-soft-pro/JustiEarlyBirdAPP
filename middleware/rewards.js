const ProjectModel = require('../models/project');
const RewardModel = require('../models/reward');

const exist = async (req, res, next) => {
  req.reward = await RewardModel.findById(req.params.id).catch(() => null);
  if (!req.reward) return res.status(404).send('Reward not found');
  return next();
};

const projectOwnerOnly = async (req, res, next) => {
  const { reward, user } = req;
  req.project = await ProjectModel.findById(reward.project_id).catch(() => null);
  if (user.is_admin) return next();
  if (!req.project) return res.status(404).send('Reward\'s project not found');
  if (req.project.user_id !== user.id) return res.status(403).send('Reward\'s project doesn\'t belong to current user');
  return next();
};

module.exports = {
  exist,
  projectOwnerOnly,
};
