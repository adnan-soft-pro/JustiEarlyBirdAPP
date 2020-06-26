const express = require('express');
const logger = require('../helpers/logger');
const UserModel = require('../models/user');

const router = express.Router();
// Read
router.get('/:id', async (req, res, next) => {
  try {
    res.send(await UserModel.findById({ _id: req.params.id })).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

// Update
router.put('/:id', async (req, res, next) => {
  try {
    res.send(await UserModel.findByIdAndUpdate({ _id: req.params.id }, req.body)).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

// Delete
router.delete('/:id', async (req, res, next) => {
  try {
    res.send(await UserModel.findByIdAndRemove({ _id: req.params.id })).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

// Create
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

module.exports = router;
