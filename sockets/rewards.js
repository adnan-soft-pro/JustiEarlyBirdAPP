/* eslint-disable no-underscore-dangle */
const RewardModel = require('../models/reward');
const RewardChangeLogModel = require('../models/reward_change_log');

const handleSubscription = async (socket, data) => {
  const { rewardId } = data.params;

  if (!rewardId) {
    return socket.emit('subscribe-error', { msg: 'objectId not specified' });
  }

  try {
    const reward = await RewardModel.findById(rewardId);
    if (!reward) throw new Error();
  } catch (err) {
    return socket.emit('subscribe-error', { msg: `Reward ${rewardId} not found` });
  }

  socket.join(rewardId);
  return socket.emit('subscribe-success', { rewardId });
};

const init = (io) => {
  RewardChangeLogModel.watch().on('change', (data) => {
    const { operationType, fullDocument } = data;
    if (operationType === 'insert') {
      io.sockets
        .in(fullDocument.reward_id)
        .emit('reward-change-log-created', fullDocument);
    }
  });

  RewardModel.watch().on('change', (data) => {
    const { operationType, updateDescription, documentKey } = data;
    if (operationType === 'update') {
      io.sockets
        .in(documentKey._id)
        .emit('reward-changed', { updateDescription, id: documentKey._id });
    }
  });
};

module.exports = {
  init,
  handleSubscription,
};
