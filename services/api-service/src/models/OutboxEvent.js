const mongoose = require('mongoose');

const { Schema } = mongoose;

const outboxEventSchema = new Schema({
  aggregateType: { type: String, required: true, trim: true },
  aggregateId: { type: Schema.Types.ObjectId, required: true },
  eventType: { type: String, required: true, trim: true },
  payload: { type: Schema.Types.Mixed, required: true },
  published: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

outboxEventSchema.index({ published: 1, createdAt: 1 });

module.exports = mongoose.model('OutboxEvent', outboxEventSchema);
