const TaskSplitter = require('../../src/task-dispatcher/TaskSplitter');

describe('TaskSplitter', () => {
  let splitter;

  beforeEach(() => {
    splitter = new TaskSplitter({
      maxGridCellsPerSubtask: 100,
    });
  });

  describe('_calculateGridSplits', () => {
    it('should split 2D grid into subgrids', () => {
      const grid = {
        origin: { x: 0, y: 0 },
        size: { x: 20, y: 20, z: 1 },
        spacing: { x: 1, y: 1, z: 1 },
      };

      const splits = splitter._calculateGridSplits(grid);
      expect(splits.length).toBeGreaterThan(1);

      let totalCells = 0;
      splits.forEach(split => {
        const cellsX = split.size.x;
        const cellsY = split.size.y;
        totalCells += cellsX * cellsY;
      });

      expect(totalCells).toBe(20 * 20);
    });

    it('should split 3D grid into subgrids', () => {
      const grid = {
        origin: { x: 0, y: 0, z: 0 },
        size: { x: 10, y: 10, z: 5 },
        spacing: { x: 1, y: 1, z: 1 },
      };

      const splits = splitter._calculateGridSplits(grid);
      expect(splits.length).toBeGreaterThan(1);

      let totalCells = 0;
      splits.forEach(split => {
        const cells = split.size.x * split.size.y * split.size.z;
        totalCells += cells;
      });

      expect(totalCells).toBe(10 * 10 * 5);
    });

    it('should not split small grid', () => {
      const grid = {
        origin: { x: 0, y: 0 },
        size: { x: 5, y: 5, z: 1 },
        spacing: { x: 1, y: 1, z: 1 },
      };

      const splits = splitter._calculateGridSplits(grid);
      expect(splits.length).toBe(1);
    });

    it('should include globalOffset in subgrids', () => {
      const grid = {
        origin: { x: 0, y: 0 },
        size: { x: 20, y: 10, z: 1 },
        spacing: { x: 1, y: 1, z: 1 },
      };

      const splits = splitter._calculateGridSplits(grid);
      expect(splits.length).toBe(2);
      expect(splits[0].globalOffset).toEqual({ x: 0, y: 0, z: 0 });
      expect(splits[1].globalOffset.x).toBeGreaterThan(0);
    });
  });

  describe('splitTask', () => {
    it('should split a task into multiple subtasks', () => {
      const task = {
        id: 'test-task-1',
        name: 'Test Task',
        description: 'Test description',
        priority: 5,
        inputData: {
          points: [
            { x: 0, y: 0, value: 1 },
            { x: 20, y: 0, value: 2 },
            { x: 0, y: 20, value: 3 },
            { x: 20, y: 20, value: 4 },
          ],
          grid: {
            origin: { x: 0, y: 0, z: 0 },
            size: { x: 20, y: 20, z: 1 },
            spacing: { x: 1, y: 1, z: 1 },
          },
          params: { algorithm: 'idw', power: 2 },
          parameterName: 'porosity',
          geologicalLayer: 'Tertiary',
        },
      };

      const subtasks = splitter.splitTask(task);

      expect(Array.isArray(subtasks)).toBe(true);
      expect(subtasks.length).toBeGreaterThan(1);

      subtasks.forEach((subtask, index) => {
        expect(subtask).toHaveProperty('id');
        expect(subtask).toHaveProperty('parentId');
        expect(subtask.parentId).toBe(task.id);
        expect(subtask).toHaveProperty('subtaskIndex');
        expect(subtask.subtaskIndex).toBe(index);
        expect(subtask).toHaveProperty('totalSubtasks');
        expect(subtask.totalSubtasks).toBe(subtasks.length);
        expect(subtask.inputData).toHaveProperty('grid');
        expect(subtask.inputData.grid).toHaveProperty('globalOffset');
        expect(subtask.inputData.parameterName).toBe(task.inputData.parameterName);
        expect(subtask.inputData.geologicalLayer).toBe(task.inputData.geologicalLayer);
        expect(subtask.isSubtask).toBe(true);
        expect(subtask.name).toContain(task.name);
        expect(subtask.priority).toBe(task.priority);
      });
    });

    it('should return single subtask for small task', () => {
      const task = {
        id: 'test-task-2',
        name: 'Small Task',
        inputData: {
          points: [{ x: 0, y: 0, value: 1 }],
          grid: {
            origin: { x: 0, y: 0, z: 0 },
            size: { x: 5, y: 5, z: 1 },
            spacing: { x: 1, y: 1, z: 1 },
          },
          params: { algorithm: 'idw' },
          parameterName: 'test',
          geologicalLayer: 'Test',
        },
      };

      const subtasks = splitter.splitTask(task);
      expect(subtasks.length).toBe(1);
      expect(subtasks[0].subtaskIndex).toBe(0);
    });
  });

  describe('mergeResults', () => {
    it('should merge multiple subtask results', () => {
      const points = [
        { x: 0, y: 0, value: 1 },
        { x: 20, y: 0, value: 2 },
        { x: 0, y: 20, value: 3 },
        { x: 20, y: 20, value: 4 },
      ];

      const task = {
        id: 'merge-test',
        inputData: {
          points,
          grid: {
            origin: { x: 0, y: 0, z: 0 },
            size: { x: 10, y: 10, z: 1 },
            spacing: { x: 1, y: 1, z: 1 },
          },
          params: { algorithm: 'nearest' },
          parameterName: 'test',
          geologicalLayer: 'Test',
        },
      };

      const subtasks = splitter.splitTask(task);
      const subtaskResults = [];

      for (const subtask of subtasks) {
        const grid = subtask.inputData.grid;
        const nx = grid.size.x;
        const ny = grid.size.y;
        const nz = grid.size.z;
        const totalCells = nx * ny * nz;
        const values = new Array(totalCells);
        const variance = new Array(totalCells).fill(0);

        let idx = 0;
        for (let k = 0; k < nz; k++) {
          for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
              const x = grid.origin.x + i * grid.spacing.x;
              const y = grid.origin.y + j * grid.spacing.y;
              values[idx] = x + y;
              idx++;
            }
          }
        }

        subtaskResults.push({
          taskId: subtask.id,
          success: true,
          grid: {
            ...grid,
            globalOffset: grid.globalOffset || { x: 0, y: 0, z: 0 },
          },
          data: {
            values,
            variance,
            stats: {
              minValue: Math.min(...values),
              maxValue: Math.max(...values),
              computationTime: 100,
              pointsUsed: points.length,
            },
          },
        });
      }

      const merged = splitter.mergeResults(subtaskResults, task);

      expect(merged.success).toBe(true);
      expect(merged.taskId).toBe(task.id);
      expect(merged.data.values.length).toBe(100);
      expect(merged.data.stats.subtasksCount).toBe(subtasks.length);
      expect(merged.parameterName).toBe(task.inputData.parameterName);
      expect(merged.geologicalLayer).toBe(task.inputData.geologicalLayer);
    });

    it('should throw if any subtask fails', () => {
      const task = {
        id: 'merge-fail-test',
        inputData: {
          grid: {
            origin: { x: 0, y: 0, z: 0 },
            size: { x: 10, y: 10, z: 1 },
            spacing: { x: 1, y: 1, z: 1 },
          },
        },
      };

      const subtaskResults = [
        { taskId: 'sub1', success: true, grid: { globalOffset: { x: 0, y: 0, z: 0 }, size: { x: 5, y: 10, z: 1 } }, data: { values: [1, 2], variance: [0, 0], stats: {} } },
        { taskId: 'sub2', success: false, error: 'Failed' },
      ];

      expect(() => splitter.mergeResults(subtaskResults, task)).toThrow('Failed');
    });
  });
});
