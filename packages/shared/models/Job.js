const mongoose = require('mongoose');

const { Schema } = mongoose;

const jobSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetUrl: { type: String, required: true, trim: true },
    httpMethod: { type: String, default: 'POST', uppercase: true, trim: true },
    headers: { type: Schema.Types.Mixed, default: {} },
    body: { type: Schema.Types.Mixed, default: null },
    scheduleType: {
      type: String,
      enum: ['CRON', 'ONE_SHOT', 'MANUAL'],
      required: true,
    },
    cronExpression: { type: String, trim: true },
    timeoutSeconds: { type: Number, default: 30, min: 1 },
    retryStrategy: {
      type: String,
      enum: ['EXPONENTIAL_BACKOFF', 'LINEAR', 'FIXED', 'NONE'],
      default: 'EXPONENTIAL_BACKOFF',
    },
    retryMaxAttempts: { type: Number, default: 3, min: 0 },
    nextRunAt: { type: Date },
    lastRunAt: { type: Date },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

module.exports = mongoose.models.Job || mongoose.model('Job', jobSchema);
