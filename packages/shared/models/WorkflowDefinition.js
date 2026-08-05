const mongoose = require('mongoose');

const { Schema } = mongoose;

const workflowDefinitionSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true },
    definition: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.models.WorkflowDefinition || mongoose.model('WorkflowDefinition', workflowDefinitionSchema);
