import DataProcessorWorker from './dataProcessor.worker.js?worker';

class WorkerPool {
  constructor(WorkerClass, poolSize = 4) {
    this.WorkerClass = WorkerClass;
    this.poolSize = poolSize;
    this.workers = [];
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.workerStatus = [];
    this.nextTaskId = 1;
    this.init();
  }

  init() {
    for (let i = 0; i < this.poolSize; i++) {
      this.createWorker(i);
    }
  }

  createWorker(index) {
    const worker = new this.WorkerClass();
    worker.onmessage = (e) => this.handleMessage(index, e);
    worker.onerror = (e) => this.handleError(index, e);
    
    this.workers[index] = worker;
    this.workerStatus[index] = {
      idle: true,
      currentTaskId: null,
      taskCount: 0
    };
  }

  handleMessage(workerIndex, e) {
    const { id, success, result, error } = e.data;
    const status = this.workerStatus[workerIndex];
    
    if (this.activeTasks.has(id)) {
      const { resolve, reject } = this.activeTasks.get(id);
      this.activeTasks.delete(id);
      
      status.idle = true;
      status.currentTaskId = null;
      
      if (success) {
        resolve(result);
      } else {
        reject(new Error(error || 'Worker task failed'));
      }
    }
    
    this.processQueue();
  }

  handleError(workerIndex, error) {
    console.error(`Worker ${workerIndex} error:`, error);
    
    const status = this.workerStatus[workerIndex];
    if (status.currentTaskId && this.activeTasks.has(status.currentTaskId)) {
      const { reject } = this.activeTasks.get(status.currentTaskId);
      this.activeTasks.delete(status.currentTaskId);
      reject(new Error(`Worker error: ${error.message}`));
    }
    
    this.workers[workerIndex].terminate();
    this.createWorker(workerIndex);
  }

  processQueue() {
    if (this.taskQueue.length === 0) return;
    
    const idleWorkerIndex = this.workerStatus.findIndex(s => s.idle);
    if (idleWorkerIndex === -1) return;
    
    const task = this.taskQueue.shift();
    this.executeTask(idleWorkerIndex, task);
  }

  executeTask(workerIndex, task) {
    const { id, task: taskType, data, options, resolve, reject } = task;
    
    const status = this.workerStatus[workerIndex];
    status.idle = false;
    status.currentTaskId = id;
    status.taskCount++;
    
    this.activeTasks.set(id, { resolve, reject });
    
    this.workers[workerIndex].postMessage({
      id,
      task: taskType,
      data,
      options
    });
  }

  submit(task, data, options = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextTaskId++;
      
      const taskObj = {
        id,
        task,
        data,
        options,
        resolve,
        reject
      };
      
      this.taskQueue.push(taskObj);
      this.processQueue();
    });
  }

  getStatus() {
    return {
      poolSize: this.poolSize,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      workers: this.workerStatus.map((s, i) => ({
        index: i,
        idle: s.idle,
        taskCount: s.taskCount
      }))
    };
  }

  terminate() {
    this.taskQueue = [];
    this.activeTasks.clear();
    
    for (let i = 0; i < this.workers.length; i++) {
      if (this.workers[i]) {
        this.workers[i].terminate();
      }
    }
    
    this.workers = [];
    this.workerStatus = [];
  }
}

class WorkerManager {
  constructor() {
    this.pools = new Map();
    this.isSupported = typeof Worker !== 'undefined';
  }

  getPool(name, WorkerClass, poolSize = 4) {
    if (!this.isSupported) {
      throw new Error('Web Workers are not supported in this environment');
    }
    
    if (!this.pools.has(name)) {
      const pool = new WorkerPool(WorkerClass, poolSize);
      this.pools.set(name, pool);
    }
    
    return this.pools.get(name);
  }

  getDataProcessorPool(poolSize = 4) {
    return this.getPool('dataProcessor', DataProcessorWorker, poolSize);
  }

  async execute(task, data, options = {}) {
    if (!this.isSupported) {
      return this.executeFallback(task, data, options);
    }
    
    const pool = this.getDataProcessorPool();
    return pool.submit(task, data, options);
  }

  executeFallback(task, data, options = {}) {
    console.warn('Web Workers not supported, executing in main thread');
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = this.processDataSync(task, data, options);
        resolve(result);
      }, 0);
    });
  }

  processDataSync(task, data, options = {}) {
    const tolerance = options.tolerance || 0.5;
    const ratio = options.ratio || 0.1;
    const minDistance = options.minDistance || 0.5;
    
    const rdp = (points, tol) => {
      if (points.length <= 2) return points;
      
      const perpDist = (p, a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (mag === 0) {
          return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2 + (p.z - a.z) ** 2);
        }
        const ux = dx / mag, uy = dy / mag, uz = dz / mag;
        const px = p.x - a.x, py = p.y - a.y, pz = p.z - a.z;
        const dot = px * ux + py * uy + pz * uz;
        const cx = px - dot * ux, cy = py - dot * uy, cz = pz - dot * uz;
        return Math.sqrt(cx * cx + cy * cy + cz * cz);
      };
      
      let maxDist = 0, maxIdx = 0;
      const first = points[0], last = points[points.length - 1];
      
      for (let i = 1; i < points.length - 1; i++) {
        const dist = perpDist(points[i], first, last);
        if (dist > maxDist) {
          maxDist = dist;
          maxIdx = i;
        }
      }
      
      if (maxDist > tol) {
        const left = rdp(points.slice(0, maxIdx + 1), tol);
        const right = rdp(points.slice(maxIdx), tol);
        return left.slice(0, left.length - 1).concat(right);
      }
      
      return [first, last];
    };
    
    const calcBounds = (points) => {
      if (!points || points.length === 0) return null;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      
      for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        minZ = Math.min(minZ, p.z);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
        maxZ = Math.max(maxZ, p.z);
      }
      
      return {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
        size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }
      };
    };
    
    switch (task) {
      case 'simplifyPath':
        return rdp(data, tolerance);
        
      case 'decimatePointCloud':
        if (ratio >= 1) return data.slice();
        const step = Math.max(1, Math.floor(1 / ratio));
        const result = [];
        for (let i = 0; i < data.length; i += step) {
          result.push(data[i]);
        }
        return result;
        
      case 'calculateBounds':
        return calcBounds(data);
        
      case 'filterByDistance':
        const maxDistSq = options.maxDistance * options.maxDistance;
        const center = options.center;
        return data.filter(p => {
          const dx = p.x - center.x;
          const dy = p.y - center.y;
          const dz = p.z - center.z;
          return dx * dx + dy * dy + dz * dz <= maxDistSq;
        });
        
      case 'processTunnels':
        return data.map(tunnel => {
          let pathPoints = tunnel.pathPoints || [];
          if (options.simplify && options.simplifyTolerance) {
            pathPoints = rdp(pathPoints, options.simplifyTolerance);
          }
          return {
            ...tunnel,
            pathPoints,
            bounds: calcBounds(pathPoints)
          };
        });
        
      default:
        return data;
    }
  }

  terminateAll() {
    for (const pool of this.pools.values()) {
      pool.terminate();
    }
    this.pools.clear();
  }

  getStatus() {
    const status = {
      isSupported: this.isSupported,
      pools: {}
    };
    
    for (const [name, pool] of this.pools.entries()) {
      status.pools[name] = pool.getStatus();
    }
    
    return status;
  }
}

const workerManager = new WorkerManager();

export function simplifyPath(points, tolerance = 0.5) {
  return workerManager.execute('simplifyPath', points, { tolerance });
}

export function decimatePointCloud(points, ratio = 0.1) {
  return workerManager.execute('decimatePointCloud', points, { ratio });
}

export function decimatePointCloudByDistance(points, minDistance = 0.5) {
  return workerManager.execute('decimatePointCloudByDistance', points, { minDistance });
}

export function calculateBounds(points) {
  return workerManager.execute('calculateBounds', points);
}

export function filterByDistance(points, center, maxDistance) {
  return workerManager.execute('filterByDistance', points, { center, maxDistance });
}

export function filterByBounds(points, bounds) {
  return workerManager.execute('filterByBounds', points, { bounds });
}

export function convertFormat(data, from, to) {
  return workerManager.execute('convertFormat', data, { from, to });
}

export function calculatePathLength(points) {
  return workerManager.execute('calculatePathLength', points);
}

export function resamplePath(points, segmentLength) {
  return workerManager.execute('resamplePath', points, { segmentLength });
}

export function processTunnels(tunnels, options = {}) {
  return workerManager.execute('processTunnels', tunnels, options);
}

export function processPipes(pipes, options = {}) {
  return workerManager.execute('processPipes', pipes, options);
}

export function processPointCloud(points, options = {}) {
  return workerManager.execute('processPointCloud', points, options);
}

export function processAllData(data, options = {}) {
  return workerManager.execute('processAll', data, options);
}

export function getWorkerStatus() {
  return workerManager.getStatus();
}

export function terminateWorkers() {
  workerManager.terminateAll();
}

export default workerManager;
