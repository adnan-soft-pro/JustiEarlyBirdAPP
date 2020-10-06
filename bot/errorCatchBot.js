process.env.NTBA_FIX_319 = 1;
const TG = require('node-telegram-bot-api');

// console.log(config);
const bot = new TG(process.env.ERR_TELEGRAM_BOT_TOKEN, { polling: false });

const mapAsync = (arr, func) => Promise.all(arr.map(func));

const sendMessage = async (text) => {
  try {
    if (process.env.NODE_ENV === 'production') mapAsync(JSON.parse(process.env.TELEGRAM_USER_IDS), (id) => bot.sendMessage(id, text));
  } catch (err) {
    console.log(`Error send messages ${err}`);
  }
};

module.exports = {
  sendMessage,
};
