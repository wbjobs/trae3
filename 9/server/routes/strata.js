const express = require('express');
const router = express.Router();
const Stratum = require('../models/Stratum');
const { getMockStrata } = require('../mock/mockData');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const DataValidator = require('../utils/dataValidator');

router.get('/', asyncHandler(async (req, res) => {
  let strata = [];
  try {
    strata = await Stratum.find().sort({ order: 1 });
  } catch (err) {
    console.warn('Database unavailable, using mock data');
  }

  if (strata.length === 0) {
    strata = getMockStrata();
  }

  const sanitizedStrata = strata.map(s => DataValidator.sanitizeStratum(s.toObject ? s.toObject() : s));

  res.json({
    status: 'success',
    count: sanitizedStrata.length,
    data: sanitizedStrata,
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  let stratum = null;
  try {
    stratum = await Stratum.findById(req.params.id);
  } catch (err) {
    console.warn('Database unavailable, checking mock data');
  }

  if (!stratum) {
    stratum = getMockStrata().find(s => s._id === req.params.id || s.id === req.params.id);
  }

  if (!stratum) {
    throw new ApiError(404, 'Stratum not found');
  }

  const sanitized = DataValidator.sanitizeStratum(stratum.toObject ? stratum.toObject() : stratum);

  res.json({
    status: 'success',
    data: sanitized,
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const validation = DataValidator.validateStratum(req.body);
  if (!validation.valid) {
    throw new ApiError(400, 'Validation failed', validation.errors);
  }

  const sanitized = DataValidator.sanitizeStratum(req.body);

  let savedStratum;
  try {
    const stratum = new Stratum(sanitized);
    savedStratum = await stratum.save();
  } catch (err) {
    throw new ApiError(400, 'Failed to create stratum', err.message);
  }

  res.status(201).json({
    status: 'success',
    data: DataValidator.sanitizeStratum(savedStratum.toObject()),
  });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const validation = DataValidator.validateStratum({ ...req.body, order: req.body.order || 1 });
  if (!validation.valid) {
    throw new ApiError(400, 'Validation failed', validation.errors);
  }

  const sanitized = DataValidator.sanitizeStratum(req.body);

  let updatedStratum;
  try {
    updatedStratum = await Stratum.findByIdAndUpdate(
      req.params.id,
      { ...sanitized, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
  } catch (err) {
    throw new ApiError(400, 'Failed to update stratum', err.message);
  }

  if (!updatedStratum) {
    throw new ApiError(404, 'Stratum not found');
  }

  res.json({
    status: 'success',
    data: DataValidator.sanitizeStratum(updatedStratum.toObject()),
  });
}));

router.post('/:id/annotations', asyncHandler(async (req, res) => {
  const annotation = req.body;
  const validation = DataValidator.validateAnnotation(annotation);
  if (!validation.valid) {
    throw new ApiError(400, 'Invalid annotation', validation.errors);
  }

  annotation.position = DataValidator.normalizePoint(annotation.position);

  let stratum;
  try {
    stratum = await Stratum.findById(req.params.id);
  } catch (err) {
    throw new ApiError(500, 'Database error', err.message);
  }

  if (!stratum) {
    throw new ApiError(404, 'Stratum not found');
  }

  if (!stratum.annotations) {
    stratum.annotations = [];
  }
  stratum.annotations.push(annotation);

  try {
    await stratum.save();
  } catch (err) {
    throw new ApiError(400, 'Failed to save annotation', err.message);
  }

  const savedAnnotation = stratum.annotations[stratum.annotations.length - 1];

  res.status(201).json({
    status: 'success',
    data: savedAnnotation,
  });
}));

router.delete('/:id/annotations/:annotationId', asyncHandler(async (req, res) => {
  let stratum;
  try {
    stratum = await Stratum.findById(req.params.id);
  } catch (err) {
    throw new ApiError(500, 'Database error', err.message);
  }

  if (!stratum) {
    throw new ApiError(404, 'Stratum not found');
  }

  const initialLength = stratum.annotations.length;
  stratum.annotations = stratum.annotations.filter(
    a => a.id !== req.params.annotationId && a._id !== req.params.annotationId
  );

  if (stratum.annotations.length === initialLength) {
    throw new ApiError(404, 'Annotation not found');
  }

  try {
    await stratum.save();
  } catch (err) {
    throw new ApiError(400, 'Failed to delete annotation', err.message);
  }

  res.json({
    status: 'success',
    message: 'Annotation deleted successfully',
  });
}));

module.exports = router;
