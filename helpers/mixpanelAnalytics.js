/* eslint-disable camelcase */
const Mixpanel = require('mixpanel');
const config = require('../config/index').app;

const mixpanel = Mixpanel.init(config.mixpanelToken);

// create or update a user in Mixpanel

const currentUser = (distinct_id, fullname, email, stripe_id, is_admin,
  location, timezone, is_suspended, signUp) => {
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
  mixpanel.people.set(distinct_id, user);
};
const currEvent = (distinct_id, eventName, category, action, label) => {
  mixpanel.track(eventName, {
    distinct_id,
    Category: category,
    Action: action,
    Label: label,
  });
};
// track an event with optional properties

// module.exports = {
//   mixpanelAnalytics,
// };

module.exports = {
  currentUser,
  currEvent,

};
