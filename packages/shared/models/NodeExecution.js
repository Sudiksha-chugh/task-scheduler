const mongoose = require('mongoose');

const { Schema } = mongoose;

const nodeExecutionSchema = new Schema(
  {
    workflowRun: {
      type: Schema.Types.ObjectId,
      ref: 'WorkflowRun',
      required: true,
      index: true,
    },
    nodeId: { type: String, required: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    execution: { type: Schema.Types.ObjectId, ref: 'Execution', index: true },
    status: {
      type: String,
      enum: ['PENDING', 'LEASED', 'RUNNING', 'SUCCESS', 'FAILED', 'DEAD'],
      default: 'PENDING',
      index: true,
    },
  },
  { timestamps: true },
);

nodeExecutionSchema.index({ workflowRun: 1, nodeId: 1 }, { unique: true });

module.exports = mongoose.models.NodeExecution || mongoose.model('NodeExecution', nodeExecutionSchema);
