/* eslint-disable no-param-reassign */
const ProjectModel = require('../models/project');
const { mapAsyncInSlices } = require('../helpers/mapAsync');
const logger = require('../helpers/logger');
const config = require('../config').app;
const mixpanelAnalytics = require('../helpers/mixpanelAnalytics');
const sendAnalytics = require('../helpers/googleAnalyticsSend');

const oneDay = 24 * 60 * 60 * 1000;
const trialPeriodLaterPlan = config.trialPeriodLaterPlan * oneDay;

module.exports = async () => {
  logger.info('updateTrialPeriods started');
  const now = Date.now();

  const projects = await ProjectModel.find({
    plan: 'later_plan',
    is_trialing: true,
  });

  await mapAsyncInSlices(
    projects.filter((p) => now - p.payment_configured_at >= trialPeriodLaterPlan),
    20,
    async (project) => {
      try {
        if (process.env.NODE_ENV === 'production') {
          sendAnalytics('trial-status', 'trial-ended-prod', 'Trial ended on production 3 days');
          mixpanelAnalytics.currEvent(project.user_id, 'Trial ended on production', 'trial-status', 'trial-ended-prod', 'Trial ended on production 3 days');
        } else if (process.env.NODE_ENV === 'staging') {
          sendAnalytics('trial-status', 'trial-ended-staging', 'Trial ended on staging 1 day');
          mixpanelAnalytics.currEvent(project.user_id, 'Trial ended on staging', 'trial-status', 'trial-ended-staging', 'Trial ended on staging 1 day');
        }
        project.is_trialing = false;
        await project.save();
      } catch (err) {
        logger.error(`Couldn't unset trialing period flag for project ${project.id}`);
      }
    },
  );
  logger.info(`updateTrialPeriods processed ${projects.length} projects`);
};
