const { v4: uuidv4 } = require('uuid');
const logger = require('../common/logger');

class TaskSplitter {
  constructor(options = {}) {
    this.maxPointsPerSubtask = options.maxPointsPerSubtask || 10000;
    this.maxGridCellsPerSubtask = options.maxGridCellsPerSubtask || 250000;
  }

  splitTask(task) {
    logger.info(`Splitting task ${task.id} into subtasks`);
    const { inputData } = task;
    const { points, grid } = inputData;

    const totalGridCells = grid.size.x * grid.size.y * grid.size.z;

    if (totalGridCells <= this.maxGridCellsPerSubtask) {
      logger.info(`Task ${task.id} does not need splitting, total cells: ${totalGridCells}`);
      const gridWithOffset = {
        ...inputData.grid,
        globalOffset: { x: 0, y: 0, z: 0 },
      };
      return [this._createSubtask(task, { ...inputData, grid: gridWithOffset }, 0, 0)];
    }

    const subtasks = [];
    const gridSplits = this._calculateGridSplits(grid);

    let subtaskIndex = 0;
    for (const subGrid of gridSplits) {
      const relevantPoints = this._filterPointsForSubgrid(points, subGrid);
      if (relevantPoints.length > 0) {
        const subtask = this._createSubtask(task, {
          points: relevantPoints,
          grid: subGrid,
          params: inputData.params,
          parameterName: inputData.parameterName,
          geologicalLayer: inputData.geologicalLayer,
        }, subtaskIndex++, gridSplits.length);
        subtasks.push(subtask);
      }
    }

    logger.info(`Task ${task.id} split into ${subtasks.length} subtasks`);
    return subtasks;
  }

  _calculateGridSplits(grid) {
    const totalCells = grid.size.x * grid.size.y * grid.size.z;
    const splitsNeeded = Math.ceil(totalCells / this.maxGridCellsPerSubtask);

    let xSplits = 1;
    let ySplits = 1;
    let zSplits = grid.size.z > 1 ? Math.min(grid.size.z, splitsNeeded) : 1;

    while (xSplits * ySplits * zSplits < splitsNeeded) {
      if (grid.size.x / xSplits >= grid.size.y / ySplits) {
        xSplits++;
      } else {
        ySplits++;
      }
    }

    const subGrids = [];
    const xChunkSize = Math.ceil(grid.size.x / xSplits);
    const yChunkSize = Math.ceil(grid.size.y / ySplits);
    const zChunkSize = Math.ceil(grid.size.z / zSplits);

    for (let z = 0; z < zSplits; z++) {
      for (let y = 0; y < ySplits; y++) {
        for (let x = 0; x < xSplits; x++) {
          const subGrid = {
            origin: {
              x: grid.origin.x + x * xChunkSize * grid.spacing.x,
              y: grid.origin.y + y * yChunkSize * grid.spacing.y,
              z: grid.origin.z + z * zChunkSize * grid.spacing.z,
            },
            size: {
              x: Math.min(xChunkSize, grid.size.x - x * xChunkSize),
              y: Math.min(yChunkSize, grid.size.y - y * yChunkSize),
              z: Math.min(zChunkSize, grid.size.z - z * zChunkSize),
            },
            spacing: grid.spacing,
            globalOffset: {
              x: x * xChunkSize,
              y: y * yChunkSize,
              z: z * zChunkSize,
            },
          };

          if (subGrid.size.x > 0 && subGrid.size.y > 0 && subGrid.size.z > 0) {
            subGrids.push(subGrid);
          }
        }
      }
    }

    return subGrids;
  }

  _filterPointsForSubgrid(points, subGrid) {
    const { origin, size, spacing } = subGrid;
    const margin = spacing.x * 2;

    const minX = origin.x - margin;
    const maxX = origin.x + size.x * spacing.x + margin;
    const minY = origin.y - margin;
    const maxY = origin.y + size.y * spacing.y + margin;
    const minZ = origin.z ? origin.z - margin : -Infinity;
    const maxZ = origin.z ? origin.z + size.z * spacing.z + margin : Infinity;

    return points.filter(point => {
      const zInRange = point.z === undefined || (point.z >= minZ && point.z <= maxZ);
      return point.x >= minX && point.x <= maxX &&
             point.y >= minY && point.y <= maxY &&
             zInRange;
    });
  }

  _createSubtask(parentTask, inputData, index, total) {
    return {
      id: uuidv4(),
      parentId: parentTask.id,
      isSubtask: true,
      subtaskIndex: index,
      totalSubtasks: total,
      name: `${parentTask.name} - Part ${index + 1}/${total}`,
      description: parentTask.description,
      priority: parentTask.priority,
      inputData,
      callbackUrl: parentTask.callbackUrl,
      metadata: {
        ...parentTask.metadata,
        parentTaskId: parentTask.id,
        subtaskIndex: index,
        totalSubtasks: total,
      },
      createdAt: Date.now(),
    };
  }

  mergeResults(subtaskResults, originalTask) {
    logger.info(`Merging ${subtaskResults.length} results for task ${originalTask.id}`);

    const { grid } = originalTask.inputData;
    const totalCells = grid.size.x * grid.size.y * grid.size.z;
    const mergedValues = new Float64Array(totalCells);
    const mergedVariance = new Float64Array(totalCells);
    let minValue = Infinity;
    let maxValue = -Infinity;
    let totalComputationTime = 0;
    let totalPointsUsed = 0;

    for (const result of subtaskResults) {
      if (!result.success) {
        logger.error(`Subtask ${result.taskId} failed, cannot merge`);
        throw new Error(`Subtask ${result.taskId} failed: ${result.error}`);
      }

      const globalOffset = result.grid.globalOffset || { x: 0, y: 0, z: 0 };
      const { values, variance, stats } = result.data;

      let idx = 0;
      for (let z = 0; z < result.grid.size.z; z++) {
        for (let y = 0; y < result.grid.size.y; y++) {
          for (let x = 0; x < result.grid.size.x; x++) {
            const globalX = globalOffset.x + x;
            const globalY = globalOffset.y + y;
            const globalZ = globalOffset.z + z;
            const globalIdx = globalX + globalY * grid.size.x + globalZ * grid.size.x * grid.size.y;

            mergedValues[globalIdx] = values[idx];
            mergedVariance[globalIdx] = variance ? variance[idx] : 0;

            if (values[idx] < minValue) minValue = values[idx];
            if (values[idx] > maxValue) maxValue = values[idx];
            idx++;
          }
        }
      }

      totalComputationTime += stats.computationTime || 0;
      totalPointsUsed += stats.pointsUsed || 0;
    }

    return {
      taskId: originalTask.id,
      success: true,
      grid,
      data: {
        values: Array.from(mergedValues),
        variance: Array.from(mergedVariance),
        stats: {
          minValue,
          maxValue,
          meanValue: mergedValues.reduce((a, b) => a + b, 0) / totalCells,
          totalCells,
          pointsUsed: totalPointsUsed,
          computationTime: totalComputationTime,
          subtasksCount: subtaskResults.length,
        },
      },
      parameterName: originalTask.inputData.parameterName,
      geologicalLayer: originalTask.inputData.geologicalLayer,
      completedAt: Date.now(),
    };
  }
}

module.exports = TaskSplitter;
