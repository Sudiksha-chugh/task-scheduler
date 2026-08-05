const mongoose = require('mongoose');

const { Schema } = mongoose;

const attemptSchema = new Schema(
  {
    httpStatusCode: { type: Number },
    responseBody: { type: String },
    errorMessage: { type: String },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { _id: false },
);

const executionSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'LEASED', 'RUNNING', 'SUCCESS', 'FAILED', 'DEAD'],
      default: 'PENDING',
      index: true,
    },
    fencingToken: { type: Number },
    retryCount: { type: Number, default: 0, min: 0 },
    attempts: { type: [attemptSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true },
);

module.exports = mongoose.models.Execution || mongoose.model('Execution', executionSchema);
