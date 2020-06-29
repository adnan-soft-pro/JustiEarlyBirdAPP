/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user');
const config = require('../config/index').app;

module.exports = async (req, res, next) => {
  try {
    if (!req.headers.authorization) return res.status(404).send('you are not authorized');

    const token = req.headers.authorization.replace('Bearer ', '');
    const decodedToken = jwt.decode(token, config.jwtSecret);

    const user = await UserModel.findOne({ _id: decodedToken._id });
    if (!user) res.status(404).send('you are not authorized');
    next();
  } catch (err) {
    res.status(404).send('you are not authorized');
  }
};
