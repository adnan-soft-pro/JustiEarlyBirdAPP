/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user');
const ProjectModel = require('../models/project');
const config = require('../config/index').app;

module.exports = async (req, res, next) => {
  try {
    if (!req.headers.authorization) return res.status(401).send('you are not authorized');
    const token = req.headers.authorization.replace('Bearer ', '');
    const decodedToken = jwt.decode(token, config.jwtSecret);

    if (req.baseUrl === '/users') {
      if (req.params.id !== decodedToken._id) return res.status(403).send('Forbidden');
    }

    if (req.baseUrl === '/projects' && req.method !== 'POST') {
      const projects = await ProjectModel.findById({ _id: req.params.id });
      if (projects.user_id !== decodedToken._id) return res.status(401).send('Forbidden');
    }

    const user = await UserModel.findOne({ _id: decodedToken._id });
    if (!user) return res.status(401).send('you are not authorized');
    next();
  } catch (err) {
    res.status(403).send('you are not authorized');
  }
};
