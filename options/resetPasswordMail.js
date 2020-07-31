const config = require('../config/index').app;

exports.resetPassword = (email, token) => ({
  to: email,
  from: config.emailFrom,
  subject: 'Reset your JustEarlybird password!',
  html: `<div>Hi there</div>
  <br/>
  <div>We understand you forgot your password. Don't worry, this happens to the best of us!
   Click this link <a href="${config.frontendURL}/reset/${token}"><strong>here</strong></a>
   to reset and choose a new password.</div>
  <br/>
  <div>Let us know if we can help with anything by replying to this email 🙌​!</div>
  <br/>
  <div>Best,</div>
  <div>JustEarlybird</div>`,
});
