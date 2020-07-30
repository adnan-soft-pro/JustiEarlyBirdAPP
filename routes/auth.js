/* eslint-disable no-unused-expressions */
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
const { resetPassword } = require('../options/resetPasswordMail');
const stripe = require('stripe')(config.stripeSecret);
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(config.sendgripApiKey);

const router = express.Router();

/**
 * Endpoint: /auth/register
 * Method: POST
 * @function
 * @name create
 * @body  {string}   email
 * @body  {string}  fullname
 * @body  {string}  password
 * @return {object}  user
 */
router.post('/register', async (req, res, next) => {
  try {
    const {
      email: _email,
      password,
      fullname,
      ...extra
    } = req.body;

    const email = _email.toLowerCase();

    if (Object.keys(extra).length) {
      return res.status(400).send(`Body contains extra fields (${Object.keys(extra)})`);
    }

    const exsistingUser = await UserModel.findOne({ email: new RegExp(`^${email}$`, 'i') });
    if (exsistingUser) {
      return res.status(400).send('The user with this email address is already registered');
    }

    const customer = await stripe.customers.create({ email });

    const user = new UserModel({
      email,
      fullname,
      password,
      stripe_id: customer.id,
    });

    res.send(await user.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
   * Endpoint: /auth/login
   * Method: POST
   * @function
   * @name authorization
   * @body  {string}   email
   * @body  {string}  password
   * @return {string}  token
   */
router.post('/login', async (req, res, next) => {
  try {
    const { password, email } = req.body;
    const user = await UserModel.findOne({ email: new RegExp(`^${email}$`, 'i') });

    if (!user) return res.status(404).send('User is not found');
    if (user.is_suspended) {
      return res.status(403).send(
        'Please contact info@justearlybird.com to get support and resolve the situation. '
        + 'We look forward to helping you with this.',
      );
    }

    const check = await bcrypt.compare(password, user.password);
    if (!check) return res.status(401).send('Invalid password');

    const token = jwt.sign(
      { id: user._id, email: user.email, type: 'login' },
      config.jwtSecret,
    );

    delete user._doc.password;
    res.header('authorization', `Bearer ${token}`).send(user);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
   * Endpoint: /auth/login/social
   * Method: POST
   * @function
   * @name authorization
   * @body  {string}   email
   * @body  {string}  password
   * @return {object}  user
   */
router.post('/login/social', async (req, res, next) => {
  try {
    const socialUrls = {
      google: `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${req.body.token}`,
      facebook: `https://graph.facebook.com/me?access_token=${req.body.token}&fields=email,name`,
    };

    const userData = await axios.get(socialUrls[req.body.social]);
    let user = await UserModel.findOne({ email: userData.data.email });

    if (!user) {
      user = new UserModel();
      user.email = userData.data.email;
      user.fullname = userData.data.name;

      const customer = await stripe.customers.create({ email: user.email });
      user.stripe_id = customer.id;

      user = await user.save();
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, type: 'login' },
      config.jwtSecret,
    );

    res.header('authorization', `Bearer ${token}`).send(user);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await UserModel.findOne({ email: new RegExp(`^${email}$`, 'i') });
    if (!user) {
      return res.status(404).send('User is not found');
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, type: 'reset' },
      config.jwtSecret,
      { expiresIn: '24h' },
    );

    await sgMail.send(resetPassword(user.email, token));

    res.send('The message was sent');
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

// Endpoint for setting a new password
router.put('/reset', async (req, res, next) => {
  try {
    const { password, token } = req.body;

    let tokenPayload;
    try {
      tokenPayload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return res.status(400).send(err.message);
    }

    if (tokenPayload.type !== 'reset') {
      return res.status(403).send("Token isn't for password reset");
    }

    const user = await UserModel.findById(tokenPayload.id);
    if (!user) {
      res.status(404).send('User not found');
    }

    if (new Date(tokenPayload.iat * 1000) < user.password_changed_at) {
      return res.status(403).send('Token is outdated');
    }

    user.password = password;
    user.password_changed_at = new Date();
    await user.save();

    res.send(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
