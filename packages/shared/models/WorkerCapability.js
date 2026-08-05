const mongoose = require('mongoose');

const { Schema } = mongoose;

const workerCapabilitySchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    workerId: { type: String, required: true, trim: true },
    capabilities: { type: [String], default: [] },
    maxConcurrency: { type: Number, default: 1, min: 1 },
    lastHeartbeatAt: { type: Date },
    status: {
      type: String,
      enum: ['ONLINE', 'OFFLINE', 'DRAINING'],
      default: 'OFFLINE',
      index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

workerCapabilitySchema.index({ tenant: 1, workerId: 1 }, { unique: true });

module.exports = mongoose.models.WorkerCapability || mongoose.model('WorkerCapability', workerCapabilitySchema);
