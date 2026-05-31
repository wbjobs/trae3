const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');

function createResultRouter(resultStorage) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const {
      parameterName,
      geologicalLayer,
      startDate,
      endDate,
      success,
      page = 1,
      pageSize = 10,
      includeValues = 'true',
    } = req.query;

    const result = await resultStorage.queryResults({
      parameterName,
      geologicalLayer,
      startDate,
      endDate,
      success: success !== undefined ? success === 'true' : undefined,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      includeValues: includeValues === 'true',
    });

    res.json({
      success: true,
      data: result,
    });
  }));

  router.get('/:resultId', asyncHandler(async (req, res) => {
    const { resultId } = req.params;
    const result = await resultStorage.getResult(resultId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Result not found',
          code: 'RESULT_NOT_FOUND',
        },
      });
    }

    res.json({
      success: true,
      data: result,
    });
  }));

  router.get('/statistics', asyncHandler(async (req, res) => {
    const { startDate, endDate, parameterName, geologicalLayer } = req.query;

    const stats = await resultStorage.getStatistics({
      startDate,
      endDate,
      parameterName,
      geologicalLayer,
    });

    res.json({
      success: true,
      data: stats,
    });
  }));

  router.get('/task/:taskId', asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const result = await resultStorage.getResult(taskId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Result not found',
          code: 'RESULT_NOT_FOUND',
        },
      });
    }

    res.json({
      success: true,
      data: result,
    });
  }));

  router.post('/query', asyncHandler(async (req, res) => {
    const {
      parameterNames,
      geologicalLayers,
      boundingBox,
      timeRange,
      aggregation,
    } = req.body;

    const queryOptions = {
      parameterName: parameterNames?.[0],
      geologicalLayer: geologicalLayers?.[0],
      startDate: timeRange?.start,
      endDate: timeRange?.end,
      page: 1,
      pageSize: 1000,
      includeValues: true,
    };

    const results = await resultStorage.queryResults(queryOptions);

    if (aggregation && results.data.length > 0) {
      const aggregated = aggregateResults(results.data, aggregation);
      return res.json({
        success: true,
        data: {
          ...results,
          aggregation: aggregated,
        },
      });
    }

    if (boundingBox && results.data.length > 0) {
      const filtered = filterByBoundingBox(results.data, boundingBox);
      return res.json({
        success: true,
        data: {
          ...results,
          data: filtered,
          total: filtered.length,
        },
      });
    }

    res.json({
      success: true,
      data: results,
    });
  }));

  return router;
}

function aggregateResults(results, aggregation) {
  const { type, field } = aggregation;
  const values = results.flatMap(r => r.data.values.filter(v => !isNaN(v)));

  if (values.length === 0) return null;

  switch (type) {
    case 'mean':
      return { mean: values.reduce((a, b) => a + b, 0) / values.length };
    case 'min':
      return { min: Math.min(...values) };
    case 'max':
      return { max: Math.max(...values) };
    case 'sum':
      return { sum: values.reduce((a, b) => a + b, 0) };
    case 'percentile':
      const sorted = [...values].sort((a, b) => a - b);
      const p = aggregation.percentile || 50;
      const idx = Math.floor(sorted.length * p / 100);
      return { percentile: sorted[idx] };
    case 'histogram':
      const bins = aggregation.bins || 10;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const binSize = (max - min) / bins;
      const histogram = new Array(bins).fill(0);
      const binEdges = [];
      for (let i = 0; i <= bins; i++) {
        binEdges.push(min + i * binSize);
      }
      for (const v of values) {
        let binIdx = Math.floor((v - min) / binSize);
        if (binIdx >= bins) binIdx = bins - 1;
        if (binIdx < 0) binIdx = 0;
        histogram[binIdx]++;
      }
      return { histogram, binEdges, bins, min, max };
    default:
      return null;
  }
}

function filterByBoundingBox(results, bbox) {
  const { minX, minY, maxX, maxY, minZ, maxZ } = bbox;

  return results.filter(result => {
    const { origin, size, spacing } = result.grid;

    const resultMinX = origin.x;
    const resultMaxX = origin.x + size.x * spacing.x;
    const resultMinY = origin.y;
    const resultMaxY = origin.y + size.y * spacing.y;
    const resultMinZ = origin.z || 0;
    const resultMaxZ = origin.z !== undefined ? origin.z + size.z * spacing.z : Infinity;

    return resultMaxX >= minX && resultMinX <= maxX &&
           resultMaxY >= minY && resultMinY <= maxY &&
           resultMaxZ >= (minZ || -Infinity) && resultMinZ <= (maxZ || Infinity);
  });
}

module.exports = createResultRouter;
