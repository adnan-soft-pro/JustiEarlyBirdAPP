/* eslint-disable global-require */
const socketGroups = {
  reward: require('./rewards'),
  project: require('./projects'),
};

module.exports = (server) => {
  const io = require('socket.io')(server);
  Object.values(socketGroups).forEach((group) => group.init(io));

  io.sockets.on('connection', (socket) => {
    socket.on('subscribe', (data) => {
      const group = socketGroups[data.objectType];

      if (!group) {
        return socket.emit('subscribe-error', { msg: `No such objectType ${data.objectType}` });
      }

      return group.handleSubscription(socket, data);
    });
  });
};
