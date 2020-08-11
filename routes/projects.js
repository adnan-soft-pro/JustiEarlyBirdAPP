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
const chargeForProject = require('../helpers/chargeForProject');

const { exist_setIdKey, ownerOnly } = require('../middleware/projects');

const exist = exist_setIdKey('id');

const ProjectModel = require('../models/project');
const RewardModel = require('../models/reward');
const UserModel = require('../models/user');
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
    if (projectUpd.password) {
      project.credentials = undefined;
      project.save();
    }

    if ((projectUpd.site_type !== project.site_type) || (projectUpd.url !== project.url)) {
      try {
        projectUpd.url = await validateProjectUrl(projectUpd.site_type, projectUpd.url, project.id);
      } catch (err) {
        return res.status(400).send(err.message);
      }
    }

    if (project.is_active && project.is_active !== projectUpd.is_active) {
      await deleteProjectFromDynamo(project.id).catch(() => { });
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
    if (req.project.is_trialing) {
      if (req.project.plan === 'now_plan' || !req.project.plan) {
        if (req.project.stripe_subscription_id) {
          await stripe.subscriptions.del(req.project.stripe_subscription_id);
        }
      }
    }

    await deleteProjectFromDynamo(req.params.id);
    await req.project.deleteOne();

    res.send({ message: 'Project successfully deleted' }).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { user, query: { unpaid } } = req;
    const projectСondition = { user_id: user.id };
    if (unpaid) projectСondition.debt = { $gte: 0 };

    let projects = await ProjectModel.find(projectСondition);

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

router.post('/:id/finish', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;

    if (project.finished_at) {
      return res.status(404).send('Project is already finished');
    }

    project.finished_at = new Date();
    project.is_active = false;
    project.is_payment_active = false;

    await project.save();

    switch (project.plan) {
      case ('now_plan'): {
        if (project.stripe_subscription_id) {
          await stripe.subscriptions.del(project.stripe_subscription_id);
        } else {
          logger.warn(`Project ${project._id} doesn't have stripe_subscription_id`);
          res.status(500).send(`Project ${project._id} doesn't have stripe_subscription_id`);
        }
        break;
      }

      case ('later_plan'): {
        if (project.initial_debt <= 0) {
          project.plan = undefined;
          project.stripe_payment_method_id = undefined;
          project.is_payment_active = false;
          project.charge_flow_status = 'not_needed';
        } else {
          project.charge_flow_status = 'scheduled';
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
      || (project.plan !== 'later_plan' && "Project doesn't have later_plan");

    if (reason400) return res.status(400).send(reason400);
    if (project.finished_at) {
      await startChargeFlow(project, true);
    } else {
      const user = await UserModel.findById(project.user_id);
      await chargeForProject(project, user);
    }
    res.sendStatus(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

const oneDay = 24 * 60 * 60 * 1000;
router.post('/:id/unpause', exist, ownerOnly, async (req, res, next) => {
  try {
    const { project } = req;
    if (project.is_active) {
      return res.status(400).send('Project already active');
    }

    if (project.is_suspended) {
      return res.status(403).send(
        'Your project has been was suspended.'
        + ' Please contact info@justearlybird.com to get support and resolve the situation.'
        + ' We look forward to helping you with this.',
      );
    }
    switch (project.plan) {
      case ('later_plan'): {
        project.days_in_pause += Math.floor((new Date() - project.last_paused_at || 0) / oneDay);
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
    project.total_billing_time += (new Date() - project.last_billing_started_at) || 0;
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

    project.total_billing_time += (new Date() - project.last_billing_started_at) || 0;
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
