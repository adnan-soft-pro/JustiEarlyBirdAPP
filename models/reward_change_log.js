const mongoose = require('mongoose');

const { Schema } = mongoose;

const RewardChangeLogSchema = new Schema({
  project_id: {
    type: String,
    required: true,
  },
  reward_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  log: {
    type: String,
  },
  isUpdated: {
    type: Boolean,
    required: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('RewardChangeLog', RewardChangeLogSchema, 'rewardChangeLog');
