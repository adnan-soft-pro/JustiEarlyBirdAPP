/* eslint-disable no-underscore-dangle */
const config = require('../config/index').app;
const stripe = require('stripe')(config.stripeSecret);
const ProjectModel = require('../models/project');

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
      }
    } catch (err) {
      console.log('err', err);
    }
  });
};
