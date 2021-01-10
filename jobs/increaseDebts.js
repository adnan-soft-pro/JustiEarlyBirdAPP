/* eslint-disable no-param-reassign */
const ProjectModel = require('../models/project');
const { mapAsyncInSlices } = require('../helpers/mapAsync');
const logger = require('../helpers/logger');
const config = require('../config').app;

const oneDay = 24 * 60 * 60 * 1000;
const trialPeriodLaterPlan = config.trialPeriodLaterPlan * oneDay;

module.exports = async () => {
  logger.info('increaseDebts started');
  const now = Date.now();

  const projects = await ProjectModel.find({
    is_active: true,
    is_payment_active: true,
    is_suspended: false,
    run_option: 1,
    plan: 'later_plan',
    credentials: true,
  });
  await mapAsyncInSlices(
    projects.filter((p) => (p.last_debt_increased_at || 0) <= now - oneDay),
    20,
    async (project) => {
      try {
        if (project.payment_configured_at <= now - trialPeriodLaterPlan) {
          project.initial_debt = (project.initial_debt || 0) + (project.new ? config.pricePerDayLaterPlan : config.oldPricePerDayLaterPlan);
          project.debt = project.initial_debt;
        }
        project.last_debt_increased_at = now;
        await project.save();
      } catch (err) {
        logger.error(`Couldn't increase project's ${project.id} debt (${err})`);
      }
    },
  );
  logger.info(`increaseDebts processed ${projects.length} projects`);
};
