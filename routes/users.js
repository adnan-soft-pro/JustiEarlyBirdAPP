/* eslint-disable import/order */
/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const logger = require('../helpers/logger');
const UserModel = require('../models/user');
const config = require('../config/index').app;

const stripe = require('stripe')(config.stripeSecret);

const router = express.Router();

/**
 * Endpoint: /users/:id
 * Method: GET
 * @function
 * @name Read
 * @param  {string}   id
 * @return {object}  user
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (req.params.id !== req.user.id) return res.sendStatus(403);
    const obj = await UserModel.findById(req.params.id);
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
router.put('/:id', async (req, res, next) => {
  try {
    if (req.params.id !== req.user.id) return res.sendStatus(403);
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
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id !== req.user.id) return res.sendStatus(403);
    const obj = await UserModel.findByIdAndRemove(req.params.id);
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
    let user = new UserModel();
    user.email = req.body.email;
    user.fullname = req.body.fullname;
    user.password = req.body.password;
    user = await user.save();

    const customer = await stripe.customers.create({ email: user.email });
    user.stripe_id = customer.id;
    user = await user.save();

    res.send(user);
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
    delete user._doc.password;
    res.header('authorization', `Bearer ${token}`).send(user);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
 * Endpoint: /users/login/social
 * Method: POST
 * @function
 * @name authorization
 * @body  {string}   email
 * @body  {string}  password
 * @return {object}  user
 */
router.post('/login/social', async (req, res, next) => {
  try {
    const userData = await axios.get(req.body.social === 'google' ? `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${req.body.token}`
      : `https://graph.facebook.com/me?access_token=${req.body.token}&fields=email,name`);
    let exsistUser = await UserModel.findOne({ email: userData.data.email });
    if (!exsistUser) {
      const user = new UserModel();
      user.email = userData.data.email;
      user.fullname = userData.data.name;
      exsistUser = await user.save();
    }

    const object = {
      _id: exsistUser._id,
      email: exsistUser.email,
    };
    const token = jwt.sign(object, config.jwtSecret);
    res.header('authorization', `Bearer ${token}`).send(exsistUser);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
