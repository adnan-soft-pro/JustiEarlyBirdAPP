const ProjectModel = require('../models/project');
const logger = require('../helpers/logger');
const bot = require('../bot/index');

module.exports = async () => {
  try {
    logger.debug('check credentials');
    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'test') {
      const projects = await ProjectModel.find({
        credentials: undefined,
        updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) },
      });

      projects.forEach((project) => {
        bot.sendMessage(`Project on JEB with url ${project.url} and ID ${project.id} can not pass verification`);
      });
    }
  } catch (err) {
    logger.error("Can't check projects credentials");
    logger.error(err);
  }
};
