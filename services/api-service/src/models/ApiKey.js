const mongoose = require('mongoose');

const { Schema } = mongoose;

const apiKeySchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    name: { type: String, required: true, trim: true },
    keyPrefix: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

apiKeySchema.index({ tenant: 1, keyPrefix: 1 });

module.exports = mongoose.model('ApiKey', apiKeySchema);
