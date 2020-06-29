/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../helpers/logger');
const UserModel = require('../models/user');
const authMiddleware = require('../middleware/auth');
const config = require('../config/index').app;

const router = express.Router();

/**
 * Endpoint: /users/:id
 * Method: GET
 * @function
 * @name Read
 * @param  {string}   id
 * @return {object}  user
 */
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const obj = await UserModel.findById({ _id: req.params.id });
    if (!obj) return res.sendStatus(404);

    delete obj._doc.password;

    res.send(obj).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
 * Endpoint: /users/:id
 * Method: PUT
 * @function
 * @name UpateUser
 * @param  {string}   id
 * @body  {string}  user.fullname
 * @body  {string}  user.email
 * @body  {string}  user.password
 * @return {object}  user
 */
router.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    let obj = await UserModel.findByIdAndUpdate({ _id: req.params.id }, req.body);
    if (!obj) return res.sendStatus(404);

    obj = await UserModel.findById({ _id: req.params.id });
    delete obj._doc.password;

    res.send(obj).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
 * Endpoint: /users/:id
 * Method: DELETE
 * @function
 * @name delete
 * @param  {string}   id
 * @return {string}  message
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const obj = await UserModel.findByIdAndRemove({ _id: req.params.id });
    if (!obj) return res.sendStatus(404);

    res.send({ message: 'User successfully deleted' }).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
 * Endpoint: /users/
 * Method: POST
 * @function
 * @name create
 * @body  {string}   email
 * @body  {string}  fullname
 * @body  {string}  password
 * @return {object}  user
 */
router.post('/', async (req, res, next) => {
  try {
    const user = new UserModel();
    user.email = req.body.email;
    user.fullname = req.body.fullname;
    user.password = req.body.password;
    res.send(await user.save()).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
 * Endpoint: /users/login
 * Method: POST
 * @function
 * @name authorization
 * @body  {string}   email
 * @body  {string}  password
 * @return {string}  token
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await UserModel.findOne({ email });
    if (!user) return res.status(403).send('User is not found');

    const check = await bcrypt.compare(password, user.password);
    if (!check) return res.status(403).send('Invalid password');

    const object = {
      _id: user._id,
      email: user.email,
    };
    const token = jwt.sign(object, config.jwtSecret);

    res.header('authorization', `Bearer ${token}`).send(token);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
