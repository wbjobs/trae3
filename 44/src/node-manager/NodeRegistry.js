const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const logger = require('../common/logger');
const { NodeNotFoundError, NodeOfflineError } = require('../common/errors');
const { validateNode } = require('../common/validators');

class NodeRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.nodes = new Map();
    this.heartbeatInterval = options.heartbeatInterval || 5000;
    this.nodeTimeout = options.nodeTimeout || 15000;
    this._startHeartbeatMonitor();
  }

  registerNode(nodeData) {
    const validatedNode = validateNode(nodeData);
    const nodeId = validatedNode.id || uuidv4();

    const node = {
      id: nodeId,
      ...validatedNode,
      status: 'online',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      currentLoad: 0,
      activeTasks: [],
      completedTasks: 0,
      failedTasks: 0,
      totalCpuTime: 0,
      supportedAlgorithms: validatedNode.supportedAlgorithms || ['kriging', 'idw', 'nearest', 'linear'],
    };

    this.nodes.set(nodeId, node);
    logger.info(`Node registered: ${node.name} (${nodeId})`);
    this.emit('node:registered', node);

    return node;
  }

  unregisterNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new NodeNotFoundError(nodeId);
    }

    node.status = 'offline';
    node.unregisteredAt = Date.now();
    this.nodes.delete(nodeId);
    logger.info(`Node unregistered: ${node.name} (${nodeId})`);
    this.emit('node:unregistered', node);

    return node;
  }

  heartbeat(nodeId, metrics = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new NodeNotFoundError(nodeId);
    }

    node.lastHeartbeat = Date.now();
    node.status = 'online';

    if (metrics.cpuUsage !== undefined) {
      node.cpuUsage = metrics.cpuUsage;
    }
    if (metrics.memoryUsage !== undefined) {
      node.memoryUsage = metrics.memoryUsage;
    }
    if (metrics.loadAverage !== undefined) {
      node.loadAverage = metrics.loadAverage;
    }
    if (metrics.currentLoad !== undefined) {
      node.currentLoad = metrics.currentLoad;
    }

    this.nodes.set(nodeId, node);
    return node;
  }

  getNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new NodeNotFoundError(nodeId);
    }
    return { ...node };
  }

  getAllNodes(statusFilter = null) {
    const nodes = Array.from(this.nodes.values());
    if (statusFilter) {
      return nodes.filter(n => n.status === statusFilter);
    }
    return nodes.map(n => ({ ...n }));
  }

  getOnlineNodes() {
    return this.getAllNodes('online');
  }

  updateNodeStatus(nodeId, status) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new NodeNotFoundError(nodeId);
    }

    const oldStatus = node.status;
    node.status = status;
    node.statusUpdatedAt = Date.now();
    this.nodes.set(nodeId, node);

    if (oldStatus !== status) {
      logger.info(`Node ${nodeId} status changed: ${oldStatus} -> ${status}`);
      this.emit(`node:${status}`, node);
    }

    return node;
  }

  assignTask(nodeId, taskId) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new NodeNotFoundError(nodeId);
    }

    if (node.status !== 'online') {
      throw new NodeOfflineError(nodeId);
    }

    node.activeTasks.push(taskId);
    node.currentLoad = node.activeTasks.length;
    this.nodes.set(nodeId, node);

    logger.debug(`Task ${taskId} assigned to node ${nodeId}`);
    return node;
  }

  completeTask(nodeId, taskId, success = true, executionTime = 0) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new NodeNotFoundError(nodeId);
    }

    const taskIndex = node.activeTasks.indexOf(taskId);
    if (taskIndex > -1) {
      node.activeTasks.splice(taskIndex, 1);
    }

    node.currentLoad = node.activeTasks.length;
    node.totalCpuTime += executionTime;

    if (success) {
      node.completedTasks++;
    } else {
      node.failedTasks++;
    }

    this.nodes.set(nodeId, node);
    logger.debug(`Task ${taskId} completed on node ${nodeId}, success: ${success}`);
    return node;
  }

  _startHeartbeatMonitor() {
    setInterval(() => {
      const now = Date.now();
      for (const [nodeId, node] of this.nodes) {
        if (node.status === 'online' && now - node.lastHeartbeat > this.nodeTimeout) {
          logger.warn(`Node ${nodeId} (${node.name}) timed out, last heartbeat: ${node.lastHeartbeat}`);
          this.updateNodeStatus(nodeId, 'offline');
        }
      }
    }, this.heartbeatInterval);
  }

  getNodeStats() {
    const nodes = this.getAllNodes();
    return {
      total: nodes.length,
      online: nodes.filter(n => n.status === 'online').length,
      offline: nodes.filter(n => n.status === 'offline').length,
      busy: nodes.filter(n => n.currentLoad > 0).length,
      totalActiveTasks: nodes.reduce((sum, n) => sum + n.activeTasks.length, 0),
      totalCompletedTasks: nodes.reduce((sum, n) => sum + n.completedTasks, 0),
      totalFailedTasks: nodes.reduce((sum, n) => sum + n.failedTasks, 0),
      avgLoad: nodes.length > 0 ? nodes.reduce((sum, n) => sum + n.currentLoad, 0) / nodes.length : 0,
    };
  }

  clear() {
    this.nodes.clear();
    logger.info('Node registry cleared');
  }
}

module.exports = NodeRegistry;
