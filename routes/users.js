/* eslint-disable camelcase */
/* eslint-disable import/order */
/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
const logger = require('../helpers/logger');
const config = require('../config').app;

const stripe = require('stripe')(config.stripeSecret);
const router = require('express').Router();

const UserModel = require('../models/user');

const selfOnly = (req, res, next) => {
  if (req.user.is_admin) return next();
  if (req.user.id !== req.params.id) return res.sendStatus(403);
  return next();
};

/**
 * Endpoint: /users/:id
 * Method: GET
 * @function
 * @name Read
 * @param  {string}   id
 * @return {object}  user
 */
router.get('/:id', selfOnly, async (req, res, next) => {
  try {
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
router.put('/:id', selfOnly, async (req, res, next) => {
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
router.delete('/:id', selfOnly, async (req, res, next) => {
  try {
    const obj = await UserModel.findByIdAndRemove(req.params.id);
    if (!obj) return res.sendStatus(404);

    res.send({ message: 'User successfully deleted' }).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/:id/payment_intents', selfOnly, async (req, res, next) => {
  try {
    const { ending_before, limit, starting_after } = req.query;

    const stripeReqBody = {};
    if (ending_before) stripeReqBody.ending_before = ending_before;
    if (starting_after) stripeReqBody.starting_after = starting_after;
    if (limit) stripeReqBody.limit = limit;
    if (req.user.stripe_id === req.params.id) {
      stripeReqBody.customer = req.user.stripe_id;
    } else {
      const user = await UserModel.findById(req.params.id);
      if (!user) return res.status(404).send(`User ${req.params.id} not found`);
      stripeReqBody.customer = user.stripe_id;
    }

    res.send(await stripe.paymentIntents.list(stripeReqBody));
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
