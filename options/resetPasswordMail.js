const config = require('../config/index').app;

exports.resetPassword = (email, token) => ({
  to: email,
  from: config.emailFrom,
  subject: 'Reset password!',
  text:
  'Welcome to the justEarlyBird!\n\n'
  + 'Please click on the following link, or paste this into your browser to reset your password:\n\n'
  + `${config.frontendURL}/reset/${token}\n\n`
  + 'Best Regards, justEarlyBird.\n',
});
