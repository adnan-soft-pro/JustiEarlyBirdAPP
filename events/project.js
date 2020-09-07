/* eslint-disable no-console */
/* eslint-disable import/order */
/* eslint-disable no-underscore-dangle */
const config = require('../config/index').app;
const stripe = require('stripe')(config.stripeSecret);
const ProjectModel = require('../models/project');

const startBillingTime = async (projectId) => {
  const project = await ProjectModel.findById(projectId);
  if (project.is_active && project.credentials && project.last_billing_started_at === undefined) {
    project.last_billing_started_at = new Date();
    await project.save();
  }
};

const pauseProject = async (projectId) => {
  const project = await ProjectModel.findById(projectId);
  if (project
    && project.is_active
    && project.is_payment_active
    && project.credentials === false
    && project.plan) {
    if (project.plan === 'later_plan') {
      project.last_paused_at = new Date();
    } else if (project.plan === 'now_plan') {
      await stripe.subscriptions.update(
        project.stripe_subscription_id,
        { pause_collection: { behavior: 'void' } },
      );
    }
    project.is_error = true;
    project.total_billing_time += (new Date() - project.last_billing_started_at) || 0;
    project.is_active = false;

    await project.save();
  }
};

const oneDay = 24 * 60 * 60 * 1000;
const unpauseProject = async (projectId) => {
  const project = await ProjectModel.findById(projectId);
  if (project
    && project.is_active
    && project.is_payment_active
    && project.credentials
    && project.plan
    && project.is_error) {
    if (project.plan === 'later_plan') {
      project.days_in_pause += Math.floor((new Date() - project.last_paused_at || 0) / oneDay);
    } else if (project.plan === 'now_plan') {
      await stripe.subscriptions.update(
        project.stripe_subscription_id,
        { pause_collection: '' },
      );
    }
    project.is_error = false;

    project.last_billing_started_at = new Date();
    await project.save();
  }
};
module.exports = () => {
  ProjectModel.watch().on('change', async (data) => {
    const {
      operationType, updateDescription, documentKey, fullDocument,
    } = data;
    try {
      if (operationType === 'update') {
        if ('display_name' in updateDescription.updatedFields) {
          const project = await ProjectModel.findById(documentKey._id);
          if (project.stripe_subscription_id) {
            stripe.subscriptions.update(
              project.stripe_subscription_id,
              { metadata: { projectName: project.display_name } },

            );
          }
        }
        await startBillingTime(documentKey._id);
        await pauseProject(documentKey._id);
        await unpauseProject(documentKey._id);
      }
      if (operationType === 'replace') {
        if ('display_name' in fullDocument) {
          if (fullDocument.stripe_subscription_id) {
            stripe.subscriptions.update(
              fullDocument.stripe_subscription_id,
              { metadata: { projectName: fullDocument.display_name } },

            );
          }
        }
        await startBillingTime(fullDocument._id);
        await pauseProject(fullDocument._id);
        await unpauseProject(fullDocument._id);
      }
    } catch (err) {
      console.log('err', err);
    }
  });
};
