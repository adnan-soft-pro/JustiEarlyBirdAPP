/* eslint-disable import/order */
/* eslint-disable camelcase */
/* eslint-disable consistent-return */
const logger = require('../helpers/logger');
const delteProjectFromDynamo = require('../helpers/deleteDynamoData');
const ProjectModel = require('../models/project');

const router = require('express').Router();

/**
 * Endpoint: /projects/:id
 * Method: GET
 * @function
 * @name Read
 * @param  {string}   id
 * @return {object}  project
 */
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

/**
 * Endpoint: /projects/:id
 * Method: PUT
 * @function
 * @name UpateProject
 * @param  {string}   id
 * @body   {object}  project
 * @return {object}  project
 */
router.put('/:id', async (req, res, next) => {
  try {
    if (!req.body.is_active) await delteProjectFromDynamo(req.params.id);
    let obj = await ProjectModel.findByIdAndUpdate({ _id: req.params.id }, req.body);
    if (!obj) return res.sendStatus(404);

    obj = await ProjectModel.findById({ _id: req.params.id });

    res.send(obj).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
 * Endpoint: /projects/:id
 * Method: DELETE
 * @function
 * @name delete
 * @param  {string}   id
 * @return {string}  message
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await delteProjectFromDynamo(req.params.id);
    const obj = await ProjectModel.findByIdAndRemove({ _id: req.params.id });
    if (!obj) return res.sendStatus(404);

    res.send({ message: 'Project successfully deleted' }).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

/**
 * Endpoint: /projects/
 * Method: POST
 * @function
 * @name create
 * @body  {string}  site_type
 * @body  {string}  email
 * @body  {string}  password
 * @body  {string}  display_name
 * @body  {string}  url
 * @body  {string}  run_option
 * @body  {string}  is_active
 * @body  {string}  user_id
 * @return {object}  project
 */
router.post('/', async (req, res, next) => {
  try {
    const { user } = req;
    const {
      site_type,
      email,
      password,
      display_name,
      url,
      ...extra
    } = req.body;

    if (Object.keys(extra).length) {
      return res.status(400).send(`Body contains extra fields (${Object.keys(extra)})`);
    }

    const project = new ProjectModel({
      user_id: user.id,
      site_type,
      email,
      password,
      display_name,
      url,
    });

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
