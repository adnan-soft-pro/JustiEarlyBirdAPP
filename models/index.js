const dbConfig = require('../config').database;
const mongoose = require('mongoose');

mongoose.Promise = global.Promise;

const db = {};
db.mongoose = mongoose;
db.url = dbConfig.db_url;

module.exports = db;