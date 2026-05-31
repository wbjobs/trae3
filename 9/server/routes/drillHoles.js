const express = require('express');
const router = express.Router();
const DrillHole = require('../models/DrillHole');
const { getMockDrillHoles } = require('../mock/mockData');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const DataValidator = require('../utils/dataValidator');

router.get('/', asyncHandler(async (req, res) => {
  let drillHoles = [];
  try {
    drillHoles = await DrillHole.find();
  } catch (err) {
    console.warn('Database unavailable, using mock data');
  }

  if (drillHoles.length === 0) {
    drillHoles = getMockDrillHoles();
  }

  res.json({
    status: 'success',
    count: drillHoles.length,
    data: drillHoles,
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  let drillHole = null;
  try {
    drillHole = await DrillHole.findById(req.params.id);
  } catch (err) {
    console.warn('Database unavailable, checking mock data');
  }

  if (!drillHole) {
    drillHole = getMockDrillHoles().find(d => d._id === req.params.id || d.id === req.params.id);
  }

  if (!drillHole) {
    throw new ApiError(404, 'Drill hole not found');
  }

  res.json({
    status: 'success',
    data: drillHole,
  });
}));

router.get('/points/all', asyncHandler(async (req, res) => {
  const points = [];
  let drillHoles = [];

  try {
    drillHoles = await DrillHole.find();
  } catch (err) {
    console.warn('Database unavailable, using mock data');
  }

  if (drillHoles.length === 0) {
    drillHoles = getMockDrillHoles();
  }

  drillHoles.forEach(hole => {
    if (!hole.samples || !Array.isArray(hole.samples)) return;

    hole.samples.forEach(sample => {
      if (typeof sample.depthFrom !== 'number' || typeof sample.depthTo !== 'number') return;

      const midDepth = (sample.depthFrom + sample.depthTo) / 2;
      const point = {
        x: DataValidator.normalizePoint({ x: hole.location.x }).x,
        y: DataValidator.normalizePoint({ y: hole.location.y }).y,
        z: DataValidator.normalizePoint({ z: -midDepth }).z,
        stratumCode: sample.stratumCode,
        stratumName: sample.stratumName,
        holeId: hole.holeId,
        depthFrom: sample.depthFrom,
        depthTo: sample.depthTo,
      };
      points.push(point);
    });
  });

  res.json({
    status: 'success',
    count: points.length,
    data: points,
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const validation = DataValidator.validateDrillHole(req.body);
  if (!validation.valid) {
    throw new ApiError(400, 'Validation failed', validation.errors);
  }

  let savedHole;
  try {
    const drillHole = new DrillHole(req.body);
    savedHole = await drillHole.save();
  } catch (err) {
    throw new ApiError(400, 'Failed to create drill hole', err.message);
  }

  res.status(201).json({
    status: 'success',
    data: savedHole,
  });
}));

module.exports = router;
