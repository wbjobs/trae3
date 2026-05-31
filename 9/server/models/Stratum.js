const mongoose = require('mongoose');

const PointSchema = new mongoose.Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  z: { type: Number, required: true },
});

const StratumSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  color: { type: String, default: '#8B4513' },
  description: { type: String },
  points: [PointSchema],
  thickness: { type: Number },
  depth: { type: Number },
  order: { type: Number, required: true },
  annotations: [{
    id: String,
    position: PointSchema,
    text: String,
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Stratum || mongoose.model('Stratum', StratumSchema);
