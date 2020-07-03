/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user');
const config = require('../config/index').app;

module.exports = async (req, res, next) => {
  try {
    if (!req.headers.authorization) return res.status(401).send('You are not authorized');

    const token = req.headers.authorization.replace('Bearer ', '');
    const decodedToken = jwt.decode(token, config.jwtSecret);

    req.user = await UserModel.findById(decodedToken._id);
    if (!req.user) return res.status(401).send('You are not authorized');
    next();
  } catch (err) {
    res.status(403).send('you are not authorized');
  }
};
