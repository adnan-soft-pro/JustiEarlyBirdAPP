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
const validateProjectUrl = require('../helpers/validateProjectUrl');

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

router.put('/:id', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;
    const projectUpd = { ...project._doc, ...req.body };

    if ((projectUpd.site_type !== project.site_type) || (projectUpd.url !== project.url)) {
      try {
        projectUpd.url = await validateProjectUrl(projectUpd.site_type, projectUpd.url, project.id);
      } catch (err) {
        return res.status(400).send(err.message);
      }
    }

    if (project.is_active && project.is_active !== projectUpd.is_active) {
      await deleteProjectFromDynamo(project.id).catch(() => {});
    }

    res.send(await ProjectModel.findByIdAndUpdate(project.id, projectUpd, { new: true }));
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
        // eslint-disable-next-line max-len
        const daysInUse = Math.floor((project.finished_at - project.payment_configured_at) / oneDay);
        const initialDebt = (daysInUse - 3 - project.days_in_pause) * laterPlanPerDay;
        project.initial_debt = initialDebt <= 0 ? 0 : initialDebt;
        project.debt = initialDebt <= 0 ? 0 : initialDebt;
        project.charge_flow_status = initialDebt <= 0 ? 'not_needed' : 'scheduled';
        if (initialDebt <= 0) {
          project.plan = undefined;
          project.stripe_payment_method_id = undefined;
        }
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

    const reason400 = null
      || (project.plan !== 'later_plan' && "Project doesn't have later_plan")
      || (!project.finished_at && 'Project is not finished yet')
      || (project.charge_flow_status !== 'scheduled' && 'Charge flow is already started for this project');

    if (reason400) return res.status(400).send(reason400);

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
    if (project.is_active) {
      return res.status(400).send('Project already active');
    }

    switch (project.plan) {
      case ('later_plan'): {
        project.days_in_pause += Math.floor((new Date() - project.last_paused_at) / oneDay);
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

    project.is_active = true;
    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

router.post('/:id/pause', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;
    if (!project.is_active) {
      return res.status(400).send('Project already inactive');
    }

    switch (project.plan) {
      case ('later_plan'): {
        project.last_paused_at = new Date();
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

    project.is_active = false;
    res.send(await project.save());
  } catch (err) {
    next(new Error(err));
  }
});

router.get('/:id/logs', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;
    const { page, limit, showLogs } = req.query;

    const isUpdatedFilters = {
      Adjusted: true,
      Checked: false,
      All: { $in: [false, true] },
    };

    const countLogs = await RewardChangeLogModel
      .find({ project_id: project.id, is_updated: isUpdatedFilters[showLogs] })
      .count()
      .exec();

    const changeLogs = await RewardChangeLogModel
      .find({ project_id: project.id, is_updated: isUpdatedFilters[showLogs] })
      .sort({ createdAt: -1 })
      .skip((+page - 1) * (+limit))
      .limit(+limit)
      .exec();

    res.send({ changeLogs, countLogs });
  } catch (err) {
    next(new Error(err));
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { user } = req;
    const {
      site_type,
      email,
      password,
      url,
      run_option,
      ...extra
    } = req.body;

    if (Object.keys(extra).length) {
      return res.status(400).send(`Body contains extra fields (${Object.keys(extra)})`);
    }

    let validUrl;
    try {
      validUrl = await validateProjectUrl(site_type, url);
    } catch (err) {
      return res.status(400).send(err.message);
    }

    const project = new ProjectModel({
      user_id: user.id,
      site_type,
      email,
      password,
      url: validUrl,
      run_option: run_option || 1,
    });

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
