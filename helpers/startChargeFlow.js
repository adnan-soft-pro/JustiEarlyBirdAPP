/* eslint-disable no-param-reassign */
const logger = require('./logger');
const chargeForProject = require('./chargeForProject');

const UserModel = require('../models/user');

module.exports = async (project, suspendChargeFlow = false) => {
  try {
    const user = await UserModel.findById(project.user_id);

    const throwReason = null
      || (project.plan !== 'later_plan' && "Project doesn't have later_plan")
      || (!project.stripe_payment_method_id && "Project doesn't have a stripe_payment_method_id")
      || (project.charge_flow_status !== 'scheduled' && "Charge flow isn't scheduled for this project")
      || (!user && 'Project references to not existing project')
      || (!user.stripe_id && "Project owner user doesn't have a stripe_id");

    if (throwReason) throw new Error(throwReason);

    //* Do not replace with .update (Object won't update)
    project.charge_flow_status = '/1';
    await project.save();
    await chargeForProject(project, user, suspendChargeFlow);

    logger.info(`Started charge flow for project ${project.id}`);
  } catch (err) {
    logger.error(`Couldn't start charge flow for project (${err})`);
    await project.update({ charge_flow_status: 'scheduled' });
    throw err;
  }
};
