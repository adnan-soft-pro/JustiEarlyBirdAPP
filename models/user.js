/* eslint-disable consistent-return */
/* eslint-disable no-underscore-dangle */
/* eslint-disable func-names */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const { Schema } = mongoose;

const UserSchema = new Schema({
  fullname: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  stripe_id: { type: String },
  is_admin: { type: Boolean },
  location: { type: String },
  timezone: { type: String },
  referrer: { type: String },
  is_suspended: { type: Boolean, default: false },
  password_changed_at: { type: Date },
  is_trial: { type: Boolean, default: true },
  ref_code: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// eslint-disable-next-line consistent-return
UserSchema.pre('save', function (next) {
  const user = this;
  if (!user.isModified('password')) return next();
  this.password = bcrypt.hashSync(this.password, 8);
  next();
});

UserSchema.pre('findOneAndUpdate', function (next) {
  if (!this._update.password) return next();
  this._update.password = bcrypt.hashSync(this._update.password, 8);
  next();
});

module.exports = mongoose.model('User', UserSchema);
