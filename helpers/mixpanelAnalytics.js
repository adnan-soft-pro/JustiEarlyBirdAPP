/* eslint-disable camelcase */
const Mixpanel = require('mixpanel');
const config = require('../config/index').app;
const ProjectModel = require('../models/project');

const mixpanel = Mixpanel.init(config.mixpanelToken);

// create or update a user in Mixpanel

const currentUser = async (distinct_id, fullname, email, stripe_id, is_admin,
  location, timezone, is_suspended, signUp, plan) => {
  if (process.env.NODE_ENV !== 'production') return 1;
  const user = {
    $first_name: fullname,
    $email: email,
    stripe_id,
    is_admin,
    location,
    timezone,
    is_suspended,
    USER_ID: distinct_id,
  };
  if (signUp) {
    user.$created = (new Date()).toISOString();
  }
  if (plan) {
    const projects = await ProjectModel.find({ user_id: distinct_id, is_payment_active: true });
    if (projects.length === 1) user.plan = 'User has 1 project with plan';
    else if (projects.length > 1) user.plan = `User has ${projects.length} project with plan`;
    else user.plan = 'User does not have project with plan';
  }
  return mixpanel.people.set(distinct_id, user);
};
const currEvent = (distinct_id, eventName, category, action, label) => {
  if (process.env.NODE_ENV === 'production') {
    mixpanel.track(eventName, {
      distinct_id,
      Category: category,
      Action: action,
      Label: label,
    });
  }
};
// track an event with optional properties

// module.exports = {
//   mixpanelAnalytics,
// };

module.exports = {
  currentUser,
  currEvent,

};
