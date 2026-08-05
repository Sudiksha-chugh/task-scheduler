const mongoose = require('mongoose');

const { Schema } = mongoose;

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
