/* eslint-disable import/order */
/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
/* eslint-disable consistent-return */
const router = require('express').Router();
const logger = require('../helpers/logger');
const { mapAsync } = require('../helpers/mapAsync');
const config = require('../config/index').app;

const deleteProjectFromDynamo = require('../helpers/deleteDynamoData');
const startChargeFlow = require('../helpers/startChargeFlow');

const { exist_setIdKey, ownerOnly } = require('../middleware/projects');

const exist = exist_setIdKey('id');

const ProjectModel = require('../models/project');
const RewardModel = require('../models/reward');
const RewardChangeLogModel = require('../models/reward_change_log');

const stripe = require('stripe')(config.stripeSecret);

/**
 * Endpoint: /projects/:id
 * Method: GET
 * @function
 * @name Read
 * @param  {string}   id
 * @return {object}  project
 */
router.get('/:id', exist, ownerOnly, async (req, res, next) => {
  try {
    const project = req.project._doc;
    project.rewards = await RewardModel.find({ project_id: project._id });

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
router.put('/:id', exist, ownerOnly, async (req, res, next) => {
  try {
    if (!req.body.is_active) await deleteProjectFromDynamo(req.params.id);
    await ProjectModel.findByIdAndUpdate(req.params.id, req.body);

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
router.delete('/:id', exist, ownerOnly, async (req, res, next) => {
  try {
    await deleteProjectFromDynamo(req.params.id);
    await req.project.deleteOne();

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
    let projects = await ProjectModel.find({ user_id: user.id });
    projects = projects.map((project) => project._doc);

    await mapAsync(projects, async (project) => {
      // eslint-disable-next-line no-param-reassign
      project.rewards = await RewardModel.find({ project_id: project._id });
    });

    res.send(projects);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

const oneDay = 24 * 60 * 60 * 1000;
const laterPlanPerDay = 20 * 100;
router.post('/:id/finish', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;

    if (project.finished_at) return res.status(404).send('Project is already finished');

    project.finished_at = new Date();
    project.is_active = false;
    project.is_payment_active = false;

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
        const initialDebt = (daysInUse - 3 - project.days_in_pause) * laterPlanPerDay;
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

router.post('/:id/pay', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;

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

router.post('/:id/unpause', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;
    if (project.is_payment_active) {
      return res.status(400).send('Project already active');
    }
    switch (project.plan) {
      case ('later_plan'): {
        project.days_in_pause += Math.floor((new Date() - project.last_paused_at) / oneDay);
        project.is_payment_active = true;
        break;
      }
      case ('now_plan'): {
        await stripe.subscriptions.update(
          project.stripe_subscription_id,
          { pause_collection: '' },
        );
        break;
      }
      default: {
        return res.status(400).send(`Project has incorrect plan ${project.plan}`);
      }
    }
    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

router.post('/:id/pause', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;
    if (!project.is_payment_active) {
      return res.status(400).send('Project already inactive');
    }

    switch (project.plan) {
      case ('later_plan'): {
        project.last_paused_at = new Date();
        project.is_payment_active = false;
        break;
      }
      case ('now_plan'): {
        await stripe.subscriptions.update(
          project.stripe_subscription_id,
          { pause_collection: { behavior: 'void' } },
        );
        break;
      }
      default: {
        return res.status(400).send(`Project has incorrect plan ${project.plan}`);
      }
    }
    res.send(await project.save());
  } catch (err) {
    next(new Error(err));
  }
});

router.get('/:id/logs', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;
    const changeLogs = await RewardChangeLogModel.find({ project_id: project.id }).exec();
    res.send(changeLogs);
  } catch (err) {
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
      run_option,
      is_active,
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
      run_option: run_option || 1,
      is_active,
    });

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
