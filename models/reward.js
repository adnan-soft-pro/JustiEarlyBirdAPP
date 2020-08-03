const mongoose = require('mongoose');

const { Schema } = mongoose;

const RewardSchema = new Schema({
  project_id: { type: String, required: true },
  reward_id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  total_stock: { type: Number },
  remain_stock: { type: Number },
  top_up_increment: { type: Number },
  minimum_stock: { type: Number },
  limit_stock: { type: Number },
  maximum_sales: { type: Number },
  is_ended: { type: Boolean },
  enable_top_up: { type: Boolean, default: false },
  enable_limit_sales: { type: Boolean, default: false },
  last_checked: { type: Date },
  last_adjusted: { type: Date },
  total_deleted_adjusted: { type: Number, default: 0 },
  total_deleted_checked: { type: Number, default: 0 },
  minimization_scheduled: { type: Boolean, default: false },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Reward', RewardSchema, 'rewards');
