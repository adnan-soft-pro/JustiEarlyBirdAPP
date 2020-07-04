/* eslint-disable import/order */
/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
/* eslint-disable consistent-return */
const router = require('express').Router();
const logger = require('../helpers/logger');
const config = require('../config/index').app;

const deleteProjectFromDynamo = require('../helpers/deleteDynamoData');
const ProjectModel = require('../models/project');
const startChargeFlow = require('../helpers/startChargeFlow');
const RewardModel = require('../models/rewards');

const stripe = require('stripe')(config.stripeSecret);

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
    const { user } = req;

    const project = await ProjectModel.findById(req.params.id);
    if (!project) return res.status(404).send('Project not found');
    project._doc.rewards = [];
    project._doc.rewards = await RewardModel.find({ project_id: req.params.id });
    if (project.user_id !== user.id) return res.status(403).send('Project Doesn\'t Belong To This User');

    res.send(project);
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
    const { user } = req;

    const project = await ProjectModel.findById(req.params.id);
    if (!project) return res.status(404).send('Project not found');
    if (project.user_id !== user.id) return res.status(403).send('Project Doesn\'t Belong To This User');

    if (!req.body.is_active) await deleteProjectFromDynamo(req.params.id);
    await project.replaceOne(req.body);

    res.send(await ProjectModel.findById(req.params.id).exec());
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
    const { user } = req;

    const project = await ProjectModel.findById(req.params.id);
    if (!project) return res.status(404).send('Project not found');
    if (project.user_id !== user.id) return res.status(403).send('Project Doesn\'t Belong To This User');

    await deleteProjectFromDynamo(req.params.id);
    await project.deleteOne();

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
  try {
    const { user } = req;
    const projects = await ProjectModel.find({ user_id: user.id });
    for (let i = 0; i < projects.length; i++) {
      projects[i]._doc.rewards = [];
      projects[i]._doc.rewards = await RewardModel.find({ project_id: projects[i]._id });
    }
    res.send(projects);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

const oneDay = 24 * 60 * 60 * 1000;
const laterPlanPerDay = 20 * 100;
router.post('/:id/finish', async (req, res, next) => {
  try {
    const { user } = req;
    const project = await ProjectModel.findById(req.params.id);
    if (!project) return res.status(404).send('Project not found');
    if (project.user_id !== user.id) return res.status(400).send('Project Doesn\'t Belong To This User');
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
    const { user } = req;

    const project = await ProjectModel.findById(req.params.id);

    if (!project) return res.status(404).send('Project not found');
    if (project.user_id !== user.id) return res.status(403).send('Project Doesn\'t Belong To This User');

    if (project.plan !== 'later_plan') return res.status(400).send('Project doesn\'t use LaterPlan');
    if (!project.finished_at) return res.status(400).send('Project is not finished yet');
    if (project.charge_flow_status !== 'scheduled') return res.status(400).send('Charge flow is already started for this project');

    const charge_flow_started = await startChargeFlow(project);
    res.send({ charge_flow_started });
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
router.post('/', async (req, res, next) => {
  try {
    const { user } = req;

    const {
      site_type,
      email,
      password,
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
      url,
    });

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
