const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateTask, validateBatchTask } = require('../../common/validators');

function createTaskRouter(taskScheduler, resultStorage) {
  const router = express.Router();

  router.post('/', asyncHandler(async (req, res) => {
    const taskData = validateTask(req.body);
    const task = await taskScheduler.submitTask(taskData);

    if (resultStorage) {
      await resultStorage.createTask(task);
    }

    res.status(201).json({
      success: true,
      data: task,
    });
  }));

  router.post('/batch', asyncHandler(async (req, res) => {
    const batchData = validateBatchTask(req.body);
    const batch = await taskScheduler.submitBatchTasks(batchData);

    if (resultStorage) {
      await resultStorage.createBatch(batch);
    }

    res.status(201).json({
      success: true,
      data: batch,
    });
  }));

  router.get('/:taskId', asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const task = await taskScheduler.getTaskStatus(taskId);
    res.json({
      success: true,
      data: task,
    });
  }));

  router.get('/:taskId/result', asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const useCache = req.query.cache !== 'false';

    const result = await resultStorage.getResult(taskId, useCache);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Result not found for task ${taskId}`,
          code: 'RESULT_NOT_FOUND',
        },
      });
    }

    res.json({
      success: true,
      data: result,
    });
  }));

  router.get('/:taskId/result/values', asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const result = await resultStorage.getResult(taskId);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: { message: 'Result not found', code: 'RESULT_NOT_FOUND' },
      });
    }

    const { format = 'json' } = req.query;
    const { values, stats } = result.data;
    const { grid } = result;

    if (format === 'vtk') {
      const vtkData = generateVTK(values, grid, result.parameterName);
      res.setHeader('Content-Type', 'application/vnd.vtk');
      res.setHeader('Content-Disposition', `attachment; filename="${taskId}.vtk"`);
      return res.send(vtkData);
    }

    res.json({
      success: true,
      data: {
        values,
        stats,
        grid,
        parameterName: result.parameterName,
        geologicalLayer: result.geologicalLayer,
      },
    });
  }));

  router.delete('/:taskId', asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const task = await taskScheduler.cancelTask(taskId);
    res.json({
      success: true,
      data: task,
    });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const {
      status,
      parameterName,
      geologicalLayer,
      batchId,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = req.query;

    const result = await resultStorage.getTasks({
      status,
      parameterName,
      geologicalLayer,
      batchId,
      startDate,
      endDate,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });

    res.json({
      success: true,
      data: result,
    });
  }));

  router.get('/batch/:batchId', asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    const batch = await taskScheduler.getBatchStatus(batchId);
    res.json({
      success: true,
      data: batch,
    });
  }));

  return router;
}

function generateVTK(values, grid, parameterName) {
  const { origin, size, spacing } = grid;
  const nx = size.x;
  const ny = size.y;
  const nz = size.z || 1;
  const totalPoints = nx * ny * nz;

  let vtk = '# vtk DataFile Version 3.0\n';
  vtk += `Geological ${parameterName} interpolation result\n`;
  vtk += 'ASCII\n';
  vtk += 'DATASET STRUCTURED_POINTS\n';
  vtk += `DIMENSIONS ${nx} ${ny} ${nz}\n`;
  vtk += `ORIGIN ${origin.x} ${origin.y} ${origin.z || 0}\n`;
  vtk += `SPACING ${spacing.x} ${spacing.y} ${spacing.z || 1}\n`;
  vtk += `POINT_DATA ${totalPoints}\n`;
  vtk += `SCALARS ${parameterName} float 1\n`;
  vtk += 'LOOKUP_TABLE default\n';

  for (let i = 0; i < totalPoints; i++) {
    vtk += `${values[i] || 0}\n`;
  }

  return vtk;
}

module.exports = createTaskRouter;
