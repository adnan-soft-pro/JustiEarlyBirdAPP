const mongoose = require('mongoose');

const { Schema } = mongoose;

const ProjectSchema = new Schema({
  user_id: { type: String, required: true },
  site_type: { type: String, required: true, enum: ['KS', 'IG'] },
  email: { type: String, required: true },
  password: { type: String, required: true },
  display_name: { type: String },
  url: { type: String, required: true, unique: true },
  is_active: { type: Boolean, default: false },
  is_payment_active: { type: Boolean, default: false },
  plan: { type: String, enum: ['now_plan', 'later_plan'] },
  stripe_subscription_id: { type: String },
  stripe_payment_method_id: { type: String },
  finished_at: { type: Date },
  run_option: { type: Number, default: 1 },
  charge_flow_status: { type: String, enum: ['not_needed', 'scheduled', '/1', '/2', '/4', 'done'] },
  initial_debt: { type: Number },
  debt: { type: Number },
  last_charge_attempt_at: { type: Date },
  last_adjusted: { type: Date },
  total_adjusted: { type: Number },
  credentials: { type: Boolean },
  last_check: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Project', ProjectSchema, 'projects');
