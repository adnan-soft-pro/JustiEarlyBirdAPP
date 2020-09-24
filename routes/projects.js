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
const moment = require('moment');
const { exist_setIdKey, ownerOnly } = require('../middleware/projects');

const exist = exist_setIdKey('id');

const ProjectModel = require('../models/project');
const RewardModel = require('../models/reward');
const RewardChangeLog = require('../models/reward_change_log');
const UserModel = require('../models/user');
const RewardChangeLogModel = require('../models/reward_change_log');
const stripe = require('stripe')(config.stripeSecret);
const sendAnalytics = require('../helpers/googleAnalyticsSend');
const mixpanelAnalytics = require('../helpers/mixpanelAnalytics');
const bot = require('../bot/index');

const createProjectMessage = (email, site_type, url) => {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'test') {
    const product = process.env.NODE_ENV === 'production' ? 'JEB' : 'JEB Staging';
    const cfplatform = site_type === 'KS' ? 'Kickstarter' : 'Indiegogo';
    const utcMoment = moment.utc().format('DD-MM-YYYY/hh-mm UTC');
    bot.sendMessage(`A user using the email ${email} has created a new ${cfplatform} project on ${product} for the campaign ${url} at ${utcMoment}.`);
  }
};

const createProjectNextBtnMessage = (email, site_type, url) => {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'test') {
    const product = process.env.NODE_ENV === 'production' ? 'JEB' : 'JEB Staging';
    const cfplatform = site_type === 'KS' ? 'Kickstarter' : 'Indiegogo';
    const utcMoment = moment.utc().format('DD-MM-YYYY/hh-mm UTC');
    bot.sendMessage(`A user using the email ${email} has press "next" button for create a new ${cfplatform} project on ${product} for the campaign ${url} at ${utcMoment}.`);
  }
};

const deleteProjectMessage = (project, email) => {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'test') {
    const product = process.env.NODE_ENV === 'production' ? 'JEB' : 'JEB Staging';
    const cfplatform = project.site_type === 'KS' ? 'Kickstarter' : 'Indiegogo';
    const utcMoment = moment.utc().format('DD-MM-YYYY/hh-mm UTC');
    bot.sendMessage(`A user using the email ${email} has deleted his ${cfplatform} project on ${product} for the campaign ${project.url} at ${utcMoment}.`);
  }
};

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
      await deleteProjectFromDynamo(project.id).catch(() => { });
    }
    if (req.project.email !== projectUpd.email
      || projectUpd.password
      || req.project.url !== projectUpd.url) {
      delete projectUpd.credentials;
      projectUpd.is_finished = false;
      project.is_finished = false;
      project.credentials = undefined;
      project.save();
      if (project.is_error) projectUpd.is_active = true;
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

    await RewardModel.deleteMany({ project_id: req.project._id });
    await RewardChangeLog.deleteMany({ project_id: req.project._id });
    await deleteProjectFromDynamo(req.params.id);
    await req.project.deleteOne();
    deleteProjectMessage(req.project, req.user.email);

    sendAnalytics('deleted-project-click', 'deleted-project-done', 'Deleted Project');
    mixpanelAnalytics.currentUser(
      req.user._id,
      req.user.fullname,
      req.user.email,
      req.user.stripe_id,
      req.user.is_admin,
      req.user.location,
      req.user.timezone,
      req.user.is_suspended,
      false,
      true,
    );
    mixpanelAnalytics.currEvent(req.user._id, 'Deleted Project', 'deleted-project-click', 'deleted-project-done', 'Deleted Project');

    res.send({ message: 'Project successfully deleted' }).status(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { user, query: { unpaid, limit, page } } = req;
    const projectСondition = { user_id: user.id };
    if (unpaid) projectСondition.debt = { $gt: 0 };
    const countProjects = await ProjectModel
      .find(projectСondition)
      .count()
      .exec();
    let projects = await ProjectModel
      .find(projectСondition)
      .sort({ createdAt: -1 })
      .skip((+page - 1) * (+limit))
      .limit(+limit)
      .exec();
    projects = projects.map((project) => project._doc);

    await mapAsync(projects, async (project) => {
      // eslint-disable-next-line no-param-reassign
      project.rewards = await RewardModel.find({ project_id: project._id });
    });
    res.send({ countProjects, projects });
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
        sendAnalytics('subscription-page-btn-end-sub', 'subscription-page-btn-end-sub-clicked', 'When a clicks and confirm the end subscription and pay with 14 days option');
        mixpanelAnalytics.currentUser(
          req.user._id,
          req.user.fullname,
          req.user.email,
          req.user.stripe_id,
          req.user.is_admin,
          req.user.location,
          req.user.timezone,
          req.user.is_suspended,
          false,
          true,
        );
        mixpanelAnalytics.currEvent(req.user._id, 'clicks and confirm the end subscription', 'subscription-page-btn-end-sub', 'subscription-page-btn-end-sub-clicked', 'When a clicks and confirm the end subscription and pay with 14 days option');
        project.total_billing_time += (new Date() - project.last_billing_started_at) || 0;
        project.last_billing_started_at = undefined;
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
    if (req.user.is_trial) {
      project.is_active = true;
      return res.send(await project.save());
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
        project.is_active = true;
        res.send(await project.save());
      }
    }
    project.last_billing_started_at = new Date();
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
    if (req.user.is_trial) {
      project.is_active = false;

      return res.send(await project.save());
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
        project.is_active = false;
        res.send(await project.save());
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
      is_trialing: user.is_trial,
      url: validUrl,
      run_option: run_option || 1,
    });

    mixpanelAnalytics.currentUser(
      user._id,
      user.fullname,
      user.email,
      user.stripe_id,
      user.is_admin,
      user.location,
      user.timezone,
      user.is_suspended,
      false,
      true,
    );
    if (req.body.site_type === 'KS') {
      sendAnalytics('project-created', 'project-created-ks', 'New Kickstarter project was created');
      createProjectMessage(user.email, req.body.site_type, validUrl);
      mixpanelAnalytics.currEvent(user._id, 'Create new Project', 'project-created', 'project-created-ks', 'New Kickstarter project was created');
    } else {
      sendAnalytics('project-created', 'project-created-ig', 'New Indiegogo project was created');
      createProjectMessage(user.email, req.body.site_type, validUrl);
      mixpanelAnalytics.currEvent(user._id, 'Create new Project', 'project-created', 'project-created-ig', 'New Indiegogo project was created');
    }

    res.send(await project.save());
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

router.post('/next', async (req, res, next) => {
  try {
    const { user } = req;
    const {
      url, site_type,
    } = req.body;
    let validUrl;

    try {
      validUrl = await validateProjectUrl(site_type, url);
    } catch (err) {
      return res.status(400).send(err.message);
    }

    if (req.body.site_type === 'KS') {
      sendAnalytics('user-onboard-add-project-url', 'user-onboard-add-project-url', 'User added KS project url');
      createProjectNextBtnMessage(user.email, site_type, validUrl);
      mixpanelAnalytics.currEvent(user._id, 'User onboard add project url', 'user-onboard-add-project-url', 'user-onboard-add-project-url', `User added project url. URL: ${validUrl}`);
    } else {
      sendAnalytics('user-onboard-add-project-url', 'user-onboard-add-project-url', 'User added IG project url');
      createProjectNextBtnMessage(user.email, site_type, validUrl);
      mixpanelAnalytics.currEvent(user._id, 'User onboard add project url', 'user-onboard-add-project-url', 'user-onboard-add-project-url', `User added project url. URL: ${validUrl}`);
    }
    res.sendStatus(200);
  } catch (err) {
    logger.error(err);
    next(new Error(err));
  }
});

module.exports = router;
