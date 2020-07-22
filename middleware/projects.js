const ProjectModel = require('../models/project');

// eslint-disable-next-line camelcase
const exist_setIdKey = (idKey) => async (req, res, next) => {
  req.project = await ProjectModel.findById(req.params[idKey]).exec().catch(() => null);
  if (!req.project) return res.status(404).send(`Project ${req.params[idKey]} not found`);

  return next();
};

const ownerOnly = async (req, res, next) => {
  if (req.user.is_admin) return next();
  if (req.project.user_id !== req.user.id) {
    return res.status(403).send(`Project ${req.project.id} doesn't belong to User ${req.user.id}`);
  }

  return next();
};

module.exports = {
  exist_setIdKey,
  ownerOnly,
};
