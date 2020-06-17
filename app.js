// Npm modules
require('dotenv').config({ path: `./.env` })
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

// Router
const users = require('./routes/users');
// App instance
const app = express();
// Connect to DB
const db = require('./models');

db.mongoose.connect(db.url, {
  useNewUrlParser: true,
  useFindAndModify: false,
  useUnifiedTopology: true,
  useCreateIndex: true
})
.then(() => {
  console.log("Connected to the Database!");
})
.catch(err => {
  console.log("Cannot connect to the Database!", err);
  process.exit();
})

// Use middleware
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: err
  });
});

module.exports = app;