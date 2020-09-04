const mongoose = require('mongoose');

const { Schema } = mongoose;

const ProjectSchema = new Schema({
  user_id: { type: String, required: true },
  site_type: { type: String, required: true, enum: ['KS', 'IG'] },
  url: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  password: { type: String, required: true, select: false },
  display_name: { type: String },
  is_active: { type: Boolean, default: true },
  is_payment_active: { type: Boolean, default: false },
  is_trialing: { type: Boolean },
  plan: { type: String, enum: ['now_plan', 'later_plan'] },
  stripe_subscription_id: { type: String },
  stripe_payment_method_id: { type: String },
  payment_configured_at: { type: Date },
  finished_at: { type: Date },
  last_paused_at: { type: Date },
  days_in_pause: { type: Number, default: 0 },
  run_option: { type: Number, default: 1 },
  charge_flow_status: { type: String, enum: ['not_needed', 'scheduled', '/1', '/2', '/4', 'done'] },
  initial_debt: { type: Number, default: 0 },
  debt: { type: Number, default: 0 },
  total_paid: { type: Number, default: 0 },
  last_charge_attempt_at: { type: Date },
  last_adjusted: { type: Date },
  total_adjusted: { type: Number },
  total_checked: { type: Number },
  credentials: { type: Boolean },
  last_check: { type: Date },
  payment_intent_ids: { type: [String] },
  is_suspended: { type: Boolean, default: false },
  last_billing_started_at: { type: Date },
  total_billing_time: { type: Number, default: 0 },
  is_finished: { type: Boolean, default: false },
  last_debt_increased_at: { type: Date },
  is_error: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Project', ProjectSchema, 'projects');
