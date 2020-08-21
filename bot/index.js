process.env.NTBA_FIX_319 = 1;
const TG = require('node-telegram-bot-api');
const config = require('../config/index').app;
const logger = require('../helpers/logger');

const bot = new TG(config.botToken, { polling: false });

const mapAsync = (arr, func) => Promise.all(arr.map(func));

const sendMessage = async (text) => {
  try {
    if (process.env.NODE_ENV === 'production') mapAsync(config.telegramUserIds, (id) => bot.sendMessage(id, text));
  } catch (err) {
    logger.error(`Error send messages ${err}`);
  }
};

module.exports = {
  sendMessage,
};
