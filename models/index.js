const mongoose = require('mongoose');
const dbConfig = require('../config').database;

mongoose.Promise = global.Promise;

const db = {};
db.mongoose = mongoose;
db.url = dbConfig.db_url;

module.exports = db;
