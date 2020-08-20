process.env.NTBA_FIX_319 = 1;
const TG = require('node-telegram-bot-api');
const config = require('../config/index').app;

const bot = new TG(config.botToken, { polling: true });

const mapAsync = (arr, func) => Promise.all(arr.map(func));

const sendMessage = async (text) => {
  try {
    mapAsync(config.telegramUserIds, (id) => bot.sendMessage(id, text));
  } catch (err) {
    console.log('Error send messages', err);
  }
};

module.exports = {
  sendMessage,
};
