const UserModel = require('../models/user');
const ProjectModel = require('../models/project');
const logger = require('../helpers/logger');

const threeDays = 3 * 24 * 60 * 60 * 1000;

module.exports = async () => {
  try {
    logger.debug('check trial');
    const users = await UserModel.find(
      { createdAt: { $lte: new Date() - threeDays }, is_trial: true },
    );

    await UserModel.updateMany(
      { createdAt: { $lte: new Date() - threeDays }, is_trial: true },
      { is_trial: false },
    );
    if (users) {
      await ProjectModel.updateMany(
        { user_id: { $in: users.map((u) => u.id) } },
        { is_trialing: false },
      );
    }
  } catch (err) {
    logger.error("Can't check user trial");
    logger.error(err);
  }
};
