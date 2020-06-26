/* eslint-disable consistent-return */
const express = require('express');
const logger = require('../helpers/logger');
const ProjectModel = require('../models/project');

const router = express.Router();
// Read
router.get('/:id', async (req, res, next) => {
  try {
    const projects = await ProjectModel.findById({ _id: req.params.id });
    if (!projects) return res.sendStatus(404);
    res.send(projects).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

// Update
router.put('/:id', async (req, res, next) => {
  try {
    res.send(await ProjectModel.findByIdAndUpdate({ _id: req.params.id }, req.body)).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

// Delete
router.delete('/:id', async (req, res, next) => {
  try {
    res.send(await ProjectModel.findByIdAndRemove({ _id: req.params.id })).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

// Create
router.post('/', async (req, res, next) => {
  try {
    const projects = new ProjectModel();
    projects.site_type = req.body.site_type;
    projects.email = req.body.email;
    projects.password = req.body.password;
    projects.display_name = req.body.display_name;
    projects.url = req.body.url;
    projects.run_option = req.body.run_option;
    projects.is_active = req.body.is_active;
    projects.user_id = req.body.user_id;
    res.send(await projects.save()).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
