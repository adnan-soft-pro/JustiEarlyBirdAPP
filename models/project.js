const mongoose = require('mongoose');

const { Schema } = mongoose;

const ProjectSchema = new Schema({
  user_id: { type: String, required: true },
  site_type: { type: String, required: true, enum: ['kickstarter', 'indiegogo'] },
  email: { type: String, required: true },
  password: { type: String, required: true },
  display_name: { type: String },
  url: { type: String, required: true, unique: true },
  is_active: { type: Boolean, default: false },
  plan: { type: String, enum: ['now_plan', 'later_plan'] },
  stripe_subscription_id: { type: String },
  stripe_payment_method_id: { type: String },
  ended_at: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Project', ProjectSchema, 'projects');
