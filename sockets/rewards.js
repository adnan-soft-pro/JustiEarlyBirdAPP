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

  socket.join(data.objectId);
  return socket.emit('subscribe-success', { rewardId });
};

const init = (io) => {
  RewardChangeLogModel.watch().on('change', (data) => {
    const { operationType, fullDocument: doc } = data;
    if (operationType !== 'insert') return;
    io.sockets.in(doc.reward_id).emit('reward-change-log-created', doc);
  });
};

module.exports = {
  init,
  handleSubscription,
};
