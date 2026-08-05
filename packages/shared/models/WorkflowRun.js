const mongoose = require('mongoose');

const { Schema } = mongoose;

const workflowRunSchema = new Schema(
  {
    workflowDefinition: {
      type: Schema.Types.ObjectId,
      ref: 'WorkflowDefinition',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    definition: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.models.WorkflowRun || mongoose.model('WorkflowRun', workflowRunSchema);
