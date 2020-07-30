const logger = require('../helpers/logger');
const chargeForProject = require('../helpers/chargeForProject');
const { mapAsyncInSlices } = require('../helpers/mapAsync');

const ProjectModel = require('../models/project');

const twoDays = 2 * 24 * 60 * 60 * 1000;
module.exports = async () => {
  logger.info('Retry charges cron-job started');
  const projects = await ProjectModel.find({
    charge_flow_status: '/4',
    last_charge_attempt_at: { $lte: new Date(Date.now() - twoDays) },
  });
  await mapAsyncInSlices(projects, 10, (p) => chargeForProject(p).catch(() => {}));
  logger.info(`Retry charges cron-job finished (${projects.length} projects)`);
};
