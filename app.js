// Npm modules
require('dotenv').config({ path: './.env' });
const express = require('express');
const bodyParser = require('body-parser');

// Router
const users = require('./routes/users');
const projects = require('./routes/projects');

const index = require('./routes/index');
// App instance
const app = express();
// Connect to DB
const db = require('./models');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

db.mongoose.connect(db.url, {
  useNewUrlParser: true,
  useFindAndModify: false,
  useUnifiedTopology: true,
  useCreateIndex: true,
})
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Connected to the Database!');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.log('Cannot connect to the Database!', err);
    process.exit();
  });
app.use('/', index);
app.use('/users', users);
app.use('/projects', projects);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: err,
  });
});

module.exports = app;
