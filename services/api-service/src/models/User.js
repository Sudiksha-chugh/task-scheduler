const mongoose = require('mongoose');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    role: {
      type: String,
      enum: ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'],
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);
