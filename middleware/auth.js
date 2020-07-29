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
    if (req.user.is_suspended) {
      return res.status(403)
        .send(
          'Please contact info@justearlybird.com to get support and resolve the situation. We look forward to helping you with this.',
        );
    }
    next();
  } catch (err) {
    res.status(401).send('You are not authorized');
  }
};
