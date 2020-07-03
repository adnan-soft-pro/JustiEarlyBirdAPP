/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
/* eslint-disable consistent-return */
const jwt = require('jsonwebtoken');
const router = require('express').Router();
const logger = require('../helpers/logger');
const config = require('../config/index').app;
const delteProjectFromDynamo = require('../helpers/deleteDynamoData');
const ProjectModel = require('../models/project');
const authMiddleware = require('../middleware/auth');

// eslint-disable-next-line import/order
const stripe = require('stripe')(config.stripeSecret);

/**
 * Endpoint: /projects/:id
 * Method: GET
 * @function
 * @name Read
 * @param  {string}   id
 * @return {object}  project
 */
router.get('/:id', authMiddleware, async (req, res, next) => {
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
router.put('/:id', authMiddleware, async (req, res, next) => {
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
router.delete('/:id', authMiddleware, async (req, res, next) => {
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
 * Endpoint: /projects
 * Method: GET
 * @function
 * @name getProjects
 * @return {Array}  projects
 */
router.get('/', async (req, res, next) => {
  const decodedToken = jwt.decode(req.headers.authorization.replace('Bearer ', ''), config.jwtSecret);
  try {
    const projects = await ProjectModel.find({ user_id: decodedToken._id.toString() });

    if (!projects) return res.sendStatus(404);

    res.send(projects).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

const oneDay = 3600 * 24;
const laterPlanPerDay = 20;
router.post('/:id/finish', authMiddleware, async (req, res, next) => {
  try {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) return res.status(404).send('Project not found');
    if (project.finished_at) return res.status(404).send('Project is already finished');

    project.finished_at = new Date();
    project.active = false;
    await project.save();

    switch (project.plan) {
      case ('now_plan'): {
        if (project.stripe_subscription_id) {
          await stripe.subscriptions.del(project.stripe_subscription_id);
        } else {
          logger.warn(`Project with stripe_subscription_id:${project.stripe_subscription_id} not found`);
          res.status(500).send(`Project with stripe_subscription_id:${project.stripe_subscription_id} not found`);
        }
        break;
      }

      case ('later_plan'): {
        const daysInUse = Math.floor((project.finished_at - project.createdAt) / oneDay);
        const initialDebt = (daysInUse - 3) * laterPlanPerDay;
        project.initial_debt = initialDebt <= 0 ? 0 : initialDebt;
        project.debt = initialDebt <= 0 ? 0 : initialDebt;
        project.charge_flow_status = initialDebt <= 0 ? 'not_needed' : 'scheduled';
        await project.save();
        break;
      }

      default: {
        return res.status(500).send('Project has unknown plan');
      }
    }

    res.send(project);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.post('/:id/pay', async (req, res, next) => {
  try {
    const project = await ProjectModel.findById(req.params.id);
    if (!project) return res.status(404).send('Project not found');
    if (project.plan !== 'later_plan') return res.status(400).send('Project doesn\'t use LaterPlan');
    if (!project.finished_at) return res.status(400).send('Project is not finished yet');
    if (project.charge_flow_status) return res.status(400).send('Charge flow is already started for this project');
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
 * @return {object}  project
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const decodedToken = jwt.decode(req.headers.authorization.replace('Bearer ', ''), config.jwtSecret);
    const {
      site_type,
      email,
      password,
      url,
      is_active,
    } = req.body;

    const project = new ProjectModel({
      user_id: decodedToken._id,
      site_type,
      email,
      is_active,
      run_option: 1,
      password,
      url,
    });

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
