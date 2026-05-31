const logger = require('../common/logger');

class LoadBalancer {
  constructor(strategy = 'adaptive') {
    this.strategy = strategy;
    this._roundRobinIndex = 0;
    this._nodeHealthHistory = new Map();
    this._taskHistory = new Map();
    this._dynamicThresholds = {
      cpuOverload: 0.85,
      memoryOverload: 0.85,
      loadOverload: 1.275,
      healthThreshold: 0.6,
      staleHealthMs: 300000,
    };
    this._weights = {
      cpu: 0.25,
      memory: 0.20,
      load: 0.20,
      capacity: 0.15,
      responseTime: 0.10,
      health: 0.10,
    };
    this.taskComplexityWeights = {
      kriging: 2.5,
      idw: 1.0,
      nearest: 0.3,
      linear: 0.5,
    };
  }

  selectNode(nodes, task = null) {
    if (nodes.length === 0) {
      return null;
    }

    const onlineNodes = nodes.filter(n => n.status === 'online');
    if (onlineNodes.length === 0) {
      return null;
    }

    const eligibleNodes = this._filterByAlgorithm(onlineNodes, task);
    if (eligibleNodes.length === 0) {
      logger.warn('No nodes support the required algorithm, falling back to all online nodes');
      return this._selectByStrategy(onlineNodes, task);
    }

    return this._selectByStrategy(eligibleNodes, task);
  }

  _filterByAlgorithm(nodes, task) {
    if (!task || !task.inputData || !task.inputData.params) {
      return nodes;
    }

    const requiredAlgorithm = task.inputData.params.algorithm;
    if (!requiredAlgorithm) {
      return nodes;
    }

    return nodes.filter(node => {
      if (!node.supportedAlgorithms || node.supportedAlgorithms.length === 0) {
        return true;
      }
      return node.supportedAlgorithms.includes(requiredAlgorithm);
    });
  }

  _selectByStrategy(nodes, task = null) {
    const availableNodes = this._filterOverloadedNodes(nodes);
    if (availableNodes.length === 0) {
      logger.warn('All nodes are overloaded, selecting least loaded node');
      return this._leastConnections(nodes);
    }

    switch (this.strategy) {
      case 'adaptive':
        return this._adaptiveBalancing(availableNodes, task);
      case 'least-connections':
        return this._leastConnections(availableNodes);
      case 'round-robin':
        return this._roundRobin(availableNodes);
      case 'weighted-response':
        return this._weightedResponse(availableNodes);
      case 'cpu-usage':
        return this._cpuUsage(availableNodes);
      case 'memory-available':
        return this._memoryAvailable(availableNodes);
      case 'random':
        return this._random(availableNodes);
      default:
        return this._adaptiveBalancing(availableNodes, task);
    }
  }

  _filterOverloadedNodes(nodes) {
    const thresholds = this._getDynamicThresholds();
    return nodes.filter(node => {
      const cpuUsage = node.cpuUsage !== undefined ? node.cpuUsage / 100 : 0;
      const memoryUsage = node.memoryUsage !== undefined ? node.memoryUsage / 100 : 0;
      const currentLoad = node.currentLoad || 0;
      const capacity = node.capacity || { cores: 1 };
      const loadRatio = capacity.cores > 0 ? currentLoad / capacity.cores : 0;

      const health = this._getNodeHealth(node.id);

      return cpuUsage < thresholds.cpuOverload &&
             memoryUsage < thresholds.memoryOverload &&
             loadRatio < thresholds.loadOverload &&
             health >= thresholds.healthThreshold;
    });
  }

  _getDynamicThresholds() {
    return { ...this._dynamicThresholds };
  }

  updateDynamicThresholds(metrics) {
    if (metrics.avgClusterCpu !== undefined) {
      this._dynamicThresholds.cpuOverload = Math.min(0.95, Math.max(0.7, metrics.avgClusterCpu + 0.15));
    }
    if (metrics.avgClusterMemory !== undefined) {
      this._dynamicThresholds.memoryOverload = Math.min(0.95, Math.max(0.7, metrics.avgClusterMemory + 0.15));
    }
    if (metrics.avgClusterLoad !== undefined) {
      this._dynamicThresholds.loadOverload = Math.min(2.0, Math.max(0.8, metrics.avgClusterLoad + 0.3));
    }
    if (metrics.healthThreshold !== undefined) {
      this._dynamicThresholds.healthThreshold = Math.min(0.9, Math.max(0.3, metrics.healthThreshold));
    }
    logger.info('Dynamic thresholds updated', this._dynamicThresholds);
  }

  _getNodeHealth(nodeId) {
    const history = this._nodeHealthHistory.get(nodeId);
    if (!history || history.length === 0) {
      return 1.0;
    }

    const now = Date.now();
    const recentHistory = history.filter(h => now - h.timestamp < this._dynamicThresholds.staleHealthMs);

    if (recentHistory.length === 0) {
      return 0.5;
    }

    const totalWeight = recentHistory.reduce((sum, h) => sum + h.weight, 0);
    const weightedHealth = recentHistory.reduce((sum, h) => sum + h.health * h.weight, 0);

    return totalWeight > 0 ? weightedHealth / totalWeight : 0.5;
  }

  recordNodeHealth(nodeId, healthData) {
    const {
      taskSuccess,
      responseTime,
      cpuUsage,
      memoryUsage,
      errorCount = 0,
    } = healthData;

    let health = 1.0;

    if (taskSuccess === false) {
      health -= 0.3;
    }

    if (responseTime !== undefined) {
      if (responseTime > 5000) health -= 0.2;
      else if (responseTime > 2000) health -= 0.1;
    }

    if (cpuUsage !== undefined) {
      const cpuNorm = cpuUsage / 100;
      if (cpuNorm > 0.9) health -= 0.2;
      else if (cpuNorm > 0.7) health -= 0.1;
    }

    if (memoryUsage !== undefined) {
      const memNorm = memoryUsage / 100;
      if (memNorm > 0.9) health -= 0.15;
      else if (memNorm > 0.7) health -= 0.05;
    }

    health -= Math.min(errorCount * 0.05, 0.3);

    health = Math.max(0, Math.min(1, health));

    if (!this._nodeHealthHistory.has(nodeId)) {
      this._nodeHealthHistory.set(nodeId, []);
    }

    const history = this._nodeHealthHistory.get(nodeId);
    const weight = Math.exp(-0.1 * history.length);

    history.push({
      health,
      weight: 1 - weight,
      timestamp: Date.now(),
    });

    if (history.length > 100) {
      this._nodeHealthHistory.set(nodeId, history.slice(-50));
    }
  }

  recordTaskResult(nodeId, taskResult) {
    this.recordNodeHealth(nodeId, {
      taskSuccess: taskResult.success,
      responseTime: taskResult.executionTime,
      errorCount: taskResult.success ? 0 : 1,
    });

    if (!this._taskHistory.has(nodeId)) {
      this._taskHistory.set(nodeId, []);
    }
    const hist = this._taskHistory.get(nodeId);
    hist.push({
      success: taskResult.success,
      timestamp: Date.now(),
      executionTime: taskResult.executionTime,
    });
    if (hist.length > 200) {
      this._taskHistory.set(nodeId, hist.slice(-100));
    }
  }

  _adaptiveBalancing(nodes, task) {
    const taskComplexity = this._estimateTaskComplexity(task);

    return nodes.reduce((selected, node) => {
      if (!selected) return node;

      const selectedScore = this._calculateMultiDimensionScore(selected, taskComplexity);
      const nodeScore = this._calculateMultiDimensionScore(node, taskComplexity);

      if (Math.abs(nodeScore - selectedScore) < 0.02) {
        return selected.currentLoad <= node.currentLoad ? selected : node;
      }

      return nodeScore > selectedScore ? node : selected;
    }, null);
  }

  _calculateMultiDimensionScore(node, taskComplexity = 1.0) {
    const cpuUsage = node.cpuUsage !== undefined ? node.cpuUsage / 100 : 0.5;
    const memoryUsage = node.memoryUsage !== undefined ? node.memoryUsage / 100 : 0.5;
    const currentLoad = node.currentLoad || 0;
    const capacity = node.capacity || { cores: 1, memory: 1 };
    const avgResponseTime = node.avgResponseTime || 500;
    const health = this._getNodeHealth(node.id);

    const cpuScore = Math.pow(1 - cpuUsage, 1.5);
    const memoryScore = Math.pow(1 - memoryUsage, 1.5);
    const loadScore = 1 / (currentLoad + 1);

    const cores = capacity.cores || 1;
    const memory = capacity.memory || 1;
    const capacityScore = Math.log2(cores + 1) * 0.5 + Math.log2(memory / 1024 + 1) * 0.5;

    const responseTimeScore = Math.exp(-avgResponseTime / 5000);

    const healthScore = Math.pow(health, 2);

    const nodeType = node.type || 'cpu';
    let typeBonus = 1.0;
    if (nodeType === 'gpu' && taskComplexity > 1.5) typeBonus = 1.4;
    else if (nodeType === 'gpu') typeBonus = 1.15;
    else if (nodeType === 'hybrid') typeBonus = 1.2;

    const algorithm = node.supportedAlgorithms || [];
    const algorithmBonus = algorithm.length > 0 ? 1.0 + algorithm.length * 0.05 : 1.0;

    const rawScore = (
      cpuScore * this._weights.cpu +
      memoryScore * this._weights.memory +
      loadScore * this._weights.load +
      capacityScore * this._weights.capacity +
      responseTimeScore * this._weights.responseTime +
      healthScore * this._weights.health
    );

    return rawScore * typeBonus * algorithmBonus;
  }

  _estimateTaskComplexity(task) {
    if (!task || !task.inputData || !task.inputData.params) {
      return 1.0;
    }

    const algorithm = task.inputData.params.algorithm || 'idw';
    const baseWeight = this.taskComplexityWeights[algorithm] || 1.0;

    const grid = task.inputData.grid;
    let gridSizeFactor = 1.0;
    if (grid) {
      const totalCells = (grid.size?.x || 1) * (grid.size?.y || 1) * (grid.size?.z || 1);
      gridSizeFactor = Math.min(Math.log10(totalCells + 1) / 5, 3.0);
    }

    const points = task.inputData.points || [];
    const pointsFactor = Math.min(Math.log10(points.length + 1) / 3, 2.0);

    const krigingType = task.inputData.params.variogram?.model;
    let variogramFactor = 1.0;
    if (algorithm === 'kriging' && krigingType) {
      if (krigingType === 'gaussian') variogramFactor = 1.5;
      else if (krigingType === 'exponential') variogramFactor = 1.3;
      else if (krigingType === 'spherical') variogramFactor = 1.2;
    }

    return baseWeight * gridSizeFactor * pointsFactor * variogramFactor;
  }

  _calculateAdaptiveScore(node, taskComplexity = 1.0) {
    return this._calculateMultiDimensionScore(node, taskComplexity);
  }

  getNodeHealthReport(nodeId) {
    const history = this._nodeHealthHistory.get(nodeId) || [];
    const health = this._getNodeHealth(nodeId);
    const taskHist = this._taskHistory.get(nodeId) || [];

    const recentTasks = taskHist.filter(t => Date.now() - t.timestamp < 300000);
    const successRate = recentTasks.length > 0
      ? recentTasks.filter(t => t.success).length / recentTasks.length
      : 1.0;
    const avgResponseTime = recentTasks.length > 0
      ? recentTasks.reduce((sum, t) => sum + (t.executionTime || 0), 0) / recentTasks.length
      : 0;

    return {
      nodeId,
      health,
      successRate,
      avgResponseTime,
      recentTaskCount: recentTasks.length,
      historyLength: history.length,
      status: health >= 0.8 ? 'healthy' : health >= 0.6 ? 'degraded' : 'unhealthy',
    };
  }

  _leastConnections(nodes) {
    return nodes.reduce((selected, node) => {
      if (!selected) return node;
      const selectedLoad = selected.currentLoad || selected.activeTasks?.length || 0;
      const nodeLoad = node.currentLoad || node.activeTasks?.length || 0;
      return nodeLoad < selectedLoad ? node : selected;
    }, null);
  }

  _roundRobin(nodes) {
    const node = nodes[this._roundRobinIndex % nodes.length];
    this._roundRobinIndex++;
    return node;
  }

  _weightedResponse(nodes) {
    return nodes.reduce((selected, node) => {
      if (!selected) return node;
      const selectedScore = this._calculateResponseScore(selected);
      const nodeScore = this._calculateResponseScore(node);
      return nodeScore > selectedScore ? node : selected;
    }, null);
  }

  _calculateResponseScore(node) {
    const capacity = node.capacity || { cores: 1, memory: 1 };
    const load = node.currentLoad || 0;
    const cpuUsage = node.cpuUsage !== undefined ? node.cpuUsage : 0.5;
    const memoryUsage = node.memoryUsage !== undefined ? node.memoryUsage : 0.5;

    const capacityScore = (capacity.cores * 0.4 + Math.log2(capacity.memory + 1) * 0.6);
    const loadScore = 1 / (load + 1);
    const resourceScore = (1 - cpuUsage) * 0.5 + (1 - memoryUsage) * 0.5;

    return capacityScore * loadScore * resourceScore;
  }

  _cpuUsage(nodes) {
    return nodes.reduce((selected, node) => {
      if (!selected) return node;
      const selectedCpu = selected.cpuUsage !== undefined ? selected.cpuUsage : 1;
      const nodeCpu = node.cpuUsage !== undefined ? node.cpuUsage : 1;
      return nodeCpu < selectedCpu ? node : selected;
    }, null);
  }

  _memoryAvailable(nodes) {
    return nodes.reduce((selected, node) => {
      if (!selected) return node;
      const selectedMemory = selected.memoryUsage !== undefined ? selected.memoryUsage : 1;
      const nodeMemory = node.memoryUsage !== undefined ? node.memoryUsage : 1;
      return nodeMemory < selectedMemory ? node : selected;
    }, null);
  }

  _random(nodes) {
    return nodes[Math.floor(Math.random() * nodes.length)];
  }

  setStrategy(strategy) {
    this.strategy = strategy;
    logger.info(`Load balancing strategy changed to: ${strategy}`);
  }

  getAvailableStrategies() {
    return ['adaptive', 'least-connections', 'round-robin', 'weighted-response', 'cpu-usage', 'memory-available', 'random'];
  }

  setWeights(weights) {
    if (weights) {
      const totalWeight = Object.values({ ...this._weights, ...weights }).reduce((a, b) => a + b, 0);
      if (totalWeight > 0) {
        for (const [key, value] of Object.entries(weights)) {
          if (key in this._weights) {
            this._weights[key] = value;
          }
        }
        const newTotal = Object.values(this._weights).reduce((a, b) => a + b, 0);
        if (Math.abs(newTotal - 1.0) > 0.01) {
          for (const key of Object.keys(this._weights)) {
            this._weights[key] /= newTotal;
          }
        }
      }
    }
  }

  getWeights() {
    return { ...this._weights };
  }
}

module.exports = LoadBalancer;
