/* eslint-disable no-underscore-dangle */
const ProjectModel = require('../models/project');

const handleSubscription = async (socket, data) => {
  const { projectId } = data.params;

  if (!projectId) {
    return socket.emit('subscribe-error', { msg: 'objectId not specified' });
  }

  try {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw new Error();
  } catch (err) {
    return socket.emit('subscribe-error', { msg: `Project ${projectId} not found` });
  }

  socket.join(projectId);
  return socket.emit('subscribe-success', { projectId });
};

const init = (io) => {
  ProjectModel.watch().on('change', (data) => {
    const { operationType, updateDescription, documentKey } = data;
    if (operationType === 'update') {
      io.sockets
        .in(documentKey._id)
        .emit('project-changed', { updateDescription, id: documentKey._id });
    }
  });
};

module.exports = {
  init,
  handleSubscription,
};
