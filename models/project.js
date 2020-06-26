const mongoose = require('mongoose');

const { Schema } = mongoose;

const ProjectSchema = new Schema({
  user_id: {
    type: String,
    required: true,
  },
  site_type: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  display_name: {
    type: String,
  },
  url: {
    type: String,
    required: true,
    unique: true,
  },
  run_option: {
    type: Number,
    required: true,
  },
  is_active: {
    type: Number,
    required: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Project', ProjectSchema, 'projects');
