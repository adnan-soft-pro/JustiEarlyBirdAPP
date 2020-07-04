/* eslint-disable import/order */
/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
const express = require('express');
const logger = require('../helpers/logger');
const UserModel = require('../models/user');

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

module.exports = router;
