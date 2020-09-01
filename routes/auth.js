/* eslint-disable no-unused-expressions */
/* eslint-disable import/order */
/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const moment = require('moment');
const logger = require('../helpers/logger');
const UserModel = require('../models/user');
const config = require('../config/index').app;
const { resetPassword } = require('../options/resetPasswordMail');
const stripe = require('stripe')(config.stripeSecret);
const sgMail = require('@sendgrid/mail');
const sendAnalytics = require('../helpers/googleAnalyticsSend');
const mixpanelAnalytics = require('../helpers/mixpanelAnalytics');
const bot = require('../bot/index');

sgMail.setApiKey(config.sendgripApiKey);

const router = express.Router();

const signUpMessaga = (email, platform, fullname) => {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'test') {
    const product = process.env.NODE_ENV === 'production' ? 'JEB' : 'JEB Staging';

    const utcMoment = moment.utc().format('DD-MM-YYYY/hh-mm UTC');
    bot.sendMessage(`A user using the email ${email} has signed up to ${product} at ${utcMoment} and using ${platform}. Their name is ${fullname}.`);
  }
};

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
      referrer,
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
      referrer,
      stripe_id: customer.id,
    });

    signUpMessaga(email, 'natively', fullname);
    mixpanelAnalytics.currentUser(
      user._id,
      user.fullname,
      user.email,
      user.stripe_id,
      user.is_admin,
      user.location,
      user.timezone,
      user.is_suspended,
      true,
      false,
      referrer,
    );
    if (referrer) {
      mixpanelAnalytics.currEvent(user._id, 'User referrer', 'user-referrer', 'add-user-referrer', 'User get referrer');
      sendAnalytics('user-referrer', 'add-user-referrer', 'User get referrer');
    }
    mixpanelAnalytics.currEvent(user._id, 'Sign up', 'user-sign-up', 'signed-up-native', 'New user signed up Natively');

    sendAnalytics('user-sign-up', 'signed-up-native', 'New user signed up Natively');
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
    const { password, email, referrer } = req.body;
    const user = await UserModel.findOne({ email: new RegExp(`^${email}$`, 'i') });
    if (!user) return res.status(404).send('User is not found');

    if (!user.referrer && referrer) {
      await user.update({ referrer });
      mixpanelAnalytics.currentUser(
        user._id,
        user.fullname,
        user.email,
        user.stripe_id,
        user.is_admin,
        user.location,
        user.timezone,
        user.is_suspended,
        true,
        false,
        referrer,
      );

      mixpanelAnalytics.currEvent(user._id, 'User referrer', 'user-referrer', 'add-user-referrer', 'User get referrer');
      sendAnalytics('user-referrer', 'add-user-referrer', 'User get referrer');
    }
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
    mixpanelAnalytics.currentUser(
      user._id,
      user.fullname,
      user.email,
      user.stripe_id,
      user.is_admin,
      user.location,
      user.timezone,
      user.is_suspended,
      false,
      true,
    );
    mixpanelAnalytics.currEvent(user._id, 'Log in', 'user-login', 'login-native', 'User logged in Natively');
    sendAnalytics('user-login', 'login-native', 'User logged in Natively');
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
    const { referrer } = req.body;
    if (user && !user.referrer && referrer) {
      await user.update({ referrer });
      await user.update({ referrer });
      mixpanelAnalytics.currentUser(
        user._id,
        user.fullname,
        user.email,
        user.stripe_id,
        user.is_admin,
        user.location,
        user.timezone,
        user.is_suspended,
        true,
        false,
        referrer,
      );

      mixpanelAnalytics.currEvent(user._id, 'User referrer', 'user-referrer', 'add-user-referrer', 'User get referrer');
      sendAnalytics('user-referrer', 'add-user-referrer', 'User get referrer');
    }
    if (!user) {
      user = new UserModel();
      user.email = userData.data.email;
      user.fullname = userData.data.name;
      user.referrer = referrer;
      const customer = await stripe.customers.create({ email: user.email });
      user.stripe_id = customer.id;
      if (req.body.social === 'google') {
        sendAnalytics('user-sign-up', 'signed-up-google', 'New user signed up with Google');
        signUpMessaga(user.email, 'oauth-google', user.fullname);
        mixpanelAnalytics.currentUser(
          user._id,
          user.fullname,
          user.email,
          user.stripe_id,
          user.is_admin,
          user.location,
          user.timezone,
          user.is_suspended,
          true,
          true,
        );
        mixpanelAnalytics.currEvent(user._id, 'Sign up', 'user-sign-up', 'signed-up-google', 'New user signed up with Google');
      } else {
        sendAnalytics('user-sign-up', 'signed-up-facebook', 'New user signed up with Facebook');
        signUpMessaga(user.email, 'oauth-facebook', user.fullname);
        mixpanelAnalytics.currentUser(
          user._id,
          user.fullname,
          user.email,
          user.stripe_id,
          user.is_admin,
          user.location,
          user.timezone,
          user.is_suspended,
          true,
        );
        if (referrer) {
          await user.update({ referrer });
          mixpanelAnalytics.currentUser(
            user._id,
            user.fullname,
            user.email,
            user.stripe_id,
            user.is_admin,
            user.location,
            user.timezone,
            user.is_suspended,
            true,
            false,
            referrer,
          );

          mixpanelAnalytics.currEvent(user._id, 'User referrer', 'user-referrer', 'add-user-referrer', 'User get referrer');
          sendAnalytics('user-referrer', 'add-user-referrer', 'User get referrer');
        }
        mixpanelAnalytics.currEvent(user._id, 'Sign up', 'user-sign-up', 'signed-up-facebook', 'New user signed up with Facebook');
      }

      user = await user.save();
    }

    if (req.body.social === 'google') {
      sendAnalytics('user-login', 'login-google', 'User logged in with Google');
      mixpanelAnalytics.currentUser(
        user._id,
        user.fullname,
        user.email,
        user.stripe_id,
        user.is_admin,
        user.location,
        user.timezone,
        user.is_suspended,
        false,
        true,
      );
      mixpanelAnalytics.currEvent(user._id, 'Log in', 'user-login', 'login-google', 'User logged in with Google');
    } else {
      sendAnalytics(
        'user-login',
        'login-facebook',
        'User logged in with Facebook',
      );
      mixpanelAnalytics.currentUser(
        user._id,
        user.fullname,
        user.email,
        user.stripe_id,
        user.is_admin,
        user.location,
        user.timezone,
        user.is_suspended,
        false,
        true,
      );
      mixpanelAnalytics.currEvent(user._id, 'Log in', 'user-login', 'login-facebook', 'User logged in with Facebook');
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
