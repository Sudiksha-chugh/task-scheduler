const mongoose = require('mongoose');

const { Schema } = mongoose;

const projectSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
  },
  { timestamps: true },
);

projectSchema.index({ tenant: 1, slug: 1 }, { unique: true });

module.exports = mongoose.models.Project || mongoose.model('Project', projectSchema);
