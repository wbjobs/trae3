const mongoose = require('mongoose');

const DrillHoleSchema = new mongoose.Schema({
  holeId: { type: String, required: true, unique: true },
  location: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  depth: { type: Number, required: true },
  samples: [{
    depthFrom: Number,
    depthTo: Number,
    stratumCode: String,
    stratumName: String,
    description: String,
  }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.DrillHole || mongoose.model('DrillHole', DrillHoleSchema);
