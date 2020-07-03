const startChargeFlow = require('../helpers/startChargeFlow');
const { mapAsyncInSlices } = require('../helpers/mapAsync');

const ProjectModel = require('../models/project');

const thirtyDays = 30 * 24 * 60 * 60 * 1000;
module.exports = async () => {
  const projects = await ProjectModel.find({
    charge_flow_status: 'scheduled',
    finished_at: { $lte: new Date(Date.now() - thirtyDays) },
  });
  await mapAsyncInSlices(projects, 10, startChargeFlow);
};
