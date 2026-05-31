import express from 'express';
import Joi from 'joi';
import TaskScheduler from '../services/TaskScheduler';
import DispatchCoordinator from '../services/DispatchCoordinator';
import ResultStorage from '../services/ResultStorage';
import ComputeKernel from '../services/ComputeKernel';
import { TaskStatus, CFDParameters } from '../types';
import logger from '../utils/logger';

const router = express.Router();

const taskSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().optional(),
  parameters: Joi.object().required(),
  createdBy: Joi.string().required(),
  priority: Joi.number().min(1).max(10).default(5),
  tags: Joi.array().items(Joi.string()).optional(),
  numChunks: Joi.number().min(1).max(64).default(4),
  shardingStrategy: Joi.string().valid('uniform', 'weighted', 'adaptive').default('adaptive'),
});

const batchTaskSchema = Joi.array().items(taskSchema).min(1).max(100);

router.post('/', async (req, res) => {
  try {
    const { error, value } = taskSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const task = await DispatchCoordinator.submitTask(value);

    res.status(201).json(task);
  } catch (err) {
    logger.error(`Create task error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const { error, value } = batchTaskSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const tasks = await DispatchCoordinator.submitBatchTasks(value);

    res.status(201).json({ tasks, count: tasks.length });
  } catch (err) {
    logger.error(`Batch create tasks error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to create tasks' });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as TaskStatus | undefined;
    const createdBy = req.query.createdBy as string | undefined;
    const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;

    const result = await TaskScheduler.getTasks(
      { status, createdBy, tags },
      page,
      limit
    );

    res.json({
      tasks: result.tasks,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    logger.error(`Get tasks error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await TaskScheduler.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (err) {
    logger.error(`Get task error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

router.get('/:taskId/chunks', async (req, res) => {
  try {
    const { taskId } = req.params;
    const chunks = await TaskScheduler.getTaskChunks(taskId);

    res.json({ chunks });
  } catch (err) {
    logger.error(`Get task chunks error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get task chunks' });
  }
});

router.get('/:taskId/results', async (req, res) => {
  try {
    const { taskId } = req.params;
    const results = await ResultStorage.getTaskResults(taskId);

    res.json({ results });
  } catch (err) {
    logger.error(`Get task results error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get task results' });
  }
});

router.post('/:taskId/cancel', async (req, res) => {
  try {
    const { taskId } = req.params;
    await DispatchCoordinator.cancelTask(taskId);

    res.json({ message: 'Task cancellation initiated' });
  } catch (err) {
    logger.error(`Cancel task error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

router.get('/:taskId/results/download', async (req, res) => {
  try {
    const { taskId } = req.params;
    const archivePath = await ResultStorage.createResultArchive(taskId);

    res.download(archivePath, `${taskId}_results.zip`, (err) => {
      if (err) {
        logger.error(`Download error: ${(err as Error).message}`);
      }
    });
  } catch (err) {
    logger.error(`Download results error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to create download archive' });
  }
});

router.get('/:taskId/results/export/csv', async (req, res) => {
  try {
    const { taskId } = req.params;
    const csvPath = await ResultStorage.exportToCSV(taskId);

    res.download(csvPath, `${taskId}_summary.csv`, (err) => {
      if (err) {
        logger.error(`CSV export error: ${(err as Error).message}`);
      }
    });
  } catch (err) {
    logger.error(`Export CSV error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

router.get('/:taskId/results/verify', async (req, res) => {
  try {
    const { taskId } = req.params;
    const verification = await ResultStorage.verifyTaskResults(taskId);

    res.json({
      taskId,
      valid: verification.valid,
      results: verification.results,
      missingChunks: verification.missingChunks,
    });
  } catch (err) {
    logger.error(`Verify results error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to verify results' });
  }
});

router.post('/:taskId/results/repair', async (req, res) => {
  try {
    const { taskId } = req.params;
    const repairResult = await ResultStorage.repairMissingResults(taskId);

    res.json({
      taskId,
      repaired: repairResult.repaired,
      failed: repairResult.failed,
      message: `Repaired ${repairResult.repaired.length} results, ${repairResult.failed.length} failed`,
    });
  } catch (err) {
    logger.error(`Repair results error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to repair results' });
  }
});

router.get('/results/:resultId/verify', async (req, res) => {
  try {
    const { resultId } = req.params;
    const verification = await ResultStorage.verifyResultIntegrity(resultId);

    if (!verification.valid && verification.error === 'Result not found') {
      return res.status(404).json({ error: verification.error });
    }

    res.json({
      resultId,
      valid: verification.valid,
      error: verification.error,
      details: verification.details,
    });
  } catch (err) {
    logger.error(`Verify result error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to verify result' });
  }
});

router.post('/:taskId/pause', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await TaskScheduler.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await TaskScheduler.pauseTask(taskId);
    await DispatchCoordinator.cancelTask(taskId);

    res.json({ taskId, status: 'paused', message: 'Task paused successfully' });
  } catch (err) {
    logger.error(`Pause task error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to pause task' });
  }
});

router.post('/:taskId/resume', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await TaskScheduler.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await TaskScheduler.resumeTask(taskId);
    await TaskScheduler.queueTask(taskId);

    res.json({ taskId, status: 'resumed', message: 'Task resumed successfully' });
  } catch (err) {
    logger.error(`Resume task error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to resume task' });
  }
});

router.get('/:taskId/checkpoints', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await TaskScheduler.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const checkpoints = [];
    for (const chunk of task.chunks) {
      if (chunk.checkpointTime !== undefined && chunk.checkpointTime > 0) {
        checkpoints.push({
          chunkId: chunk.id,
          checkpointTime: chunk.checkpointTime,
          checkpointPath: chunk.checkpointPath,
        });
      }
    }

    res.json({ taskId, checkpoints });
  } catch (err) {
    logger.error(`Get checkpoints error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get checkpoints' });
  }
});

router.post('/:taskId/chunks/:chunkId/checkpoint', async (req, res) => {
  try {
    const { taskId, chunkId } = req.params;
    const { casePath, currentTime } = req.body;

    if (!casePath || currentTime === undefined) {
      return res.status(400).json({ error: 'casePath and currentTime are required' });
    }

    const checkpointPath = await ComputeKernel.saveCheckpoint(casePath, currentTime);
    await TaskScheduler.saveChunkCheckpoint(chunkId, currentTime, checkpointPath);

    res.json({
      taskId,
      chunkId,
      checkpointTime: currentTime,
      checkpointPath,
      message: `Checkpoint saved at t=${currentTime}`,
    });
  } catch (err) {
    logger.error(`Save checkpoint error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to save checkpoint' });
  }
});

router.post('/:taskId/chunks/:chunkId/resume', async (req, res) => {
  try {
    const { taskId, chunkId } = req.params;
    const { casePath, solver, checkpointTime } = req.body;

    if (!casePath || !solver || checkpointTime === undefined) {
      return res.status(400).json({ error: 'casePath, solver, and checkpointTime are required' });
    }

    const task = await TaskScheduler.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const chunk = task.chunks.find(c => c.id === chunkId);
    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }

    const result = await ComputeKernel.resumeFromCheckpoint(casePath, solver, checkpointTime);

    res.json({
      taskId,
      chunkId,
      resumedFrom: checkpointTime,
      success: result.success,
      variables: result.variables,
      timesteps: result.timesteps,
    });
  } catch (err) {
    logger.error(`Resume from checkpoint error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to resume from checkpoint' });
  }
});

router.get('/:taskId/results/stream', async (req, res) => {
  try {
    const { taskId } = req.params;
    const chunkId = req.query.chunkId as string;
    const variable = req.query.variable as string;
    const start = req.query.start ? parseFloat(req.query.start as string) : undefined;
    const end = req.query.end ? parseFloat(req.query.end as string) : undefined;

    if (!chunkId || !variable) {
      return res.status(400).json({ error: 'chunkId and variable query parameters are required' });
    }

    const timestepRange = (start !== undefined && end !== undefined)
      ? { start, end }
      : undefined;

    const data = await ResultStorage.streamVariableData(taskId, chunkId, variable, timestepRange);

    res.json({
      taskId,
      chunkId,
      variable,
      timestepCount: data.length,
      data,
    });
  } catch (err) {
    logger.error(`Stream variable data error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to stream variable data' });
  }
});

router.get('/:taskId/results/statistics', async (req, res) => {
  try {
    const { taskId } = req.params;
    const variable = req.query.variable as string || 'p';

    const statistics = await ResultStorage.getVariableStatistics(taskId, variable);

    res.json({
      taskId,
      variable,
      ...statistics,
    });
  } catch (err) {
    logger.error(`Get statistics error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

router.get('/:taskId/results/shards', async (req, res) => {
  try {
    const { taskId } = req.params;
    const chunkId = req.query.chunkId as string;

    if (!chunkId) {
      return res.status(400).json({ error: 'chunkId query parameter is required' });
    }

    const shardInfo = await ResultStorage.getShardInfo(taskId, chunkId);
    if (!shardInfo) {
      return res.status(404).json({ error: 'Result not found' });
    }

    res.json({
      taskId,
      chunkId,
      ...shardInfo,
    });
  } catch (err) {
    logger.error(`Get shard info error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get shard info' });
  }
});

export default router;
