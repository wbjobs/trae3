const EventEmitter = require('events');
const NodeRegistry = require('./NodeRegistry');
const LoadBalancer = require('./LoadBalancer');
const logger = require('../common/logger');
const config = require('../../config');

class NodeManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.registry = new NodeRegistry({
      heartbeatInterval: config.node.heartbeatInterval,
      nodeTimeout: config.node.nodeTimeout,
      ...options.registryOptions,
    });
    this.loadBalancer = new LoadBalancer(options.loadBalancingStrategy || 'weighted-response');
    this._setupEventForwarding();
  }

  _setupEventForwarding() {
    this.registry.on('node:registered', (node) => {
      this.emit('node:registered', node);
      logger.info(`Node online: ${node.name} (${node.id})`);
    });

    this.registry.on('node:unregistered', (node) => {
      this.emit('node:unregistered', node);
      logger.info(`Node offline: ${node.name} (${node.id})`);
    });

    this.registry.on('node:online', (node) => {
      this.emit('node:online', node);
    });

    this.registry.on('node:offline', (node) => {
      this.emit('node:offline', node);
    });
  }

  registerNode(nodeData) {
    const node = this.registry.registerNode(nodeData);
    return node;
  }

  unregisterNode(nodeId) {
    return this.registry.unregisterNode(nodeId);
  }

  heartbeat(nodeId, metrics) {
    return this.registry.heartbeat(nodeId, metrics);
  }

  getNode(nodeId) {
    return this.registry.getNode(nodeId);
  }

  getAllNodes(statusFilter = null) {
    return this.registry.getAllNodes(statusFilter);
  }

  getOnlineNodes() {
    return this.registry.getOnlineNodes();
  }

  async selectNode(task = null) {
    const nodes = this.registry.getOnlineNodes();
    if (nodes.length === 0) {
      logger.warn('No online nodes available for task assignment');
      return null;
    }

    const selectedNode = this.loadBalancer.selectNode(nodes, task);
    if (selectedNode) {
      logger.debug(`Selected node ${selectedNode.id} (${selectedNode.name}) for task`);
    }

    return selectedNode;
  }

  async assignTask(nodeId, taskId) {
    return this.registry.assignTask(nodeId, taskId);
  }

  async completeTask(nodeId, taskId, success = true, executionTime = 0) {
    return this.registry.completeTask(nodeId, taskId, success, executionTime);
  }

  setLoadBalancingStrategy(strategy) {
    this.loadBalancer.setStrategy(strategy);
  }

  getLoadBalancingStrategies() {
    return this.loadBalancer.getAvailableStrategies();
  }

  getNodeStats() {
    return this.registry.getNodeStats();
  }

  getDetailedStats() {
    const basicStats = this.registry.getNodeStats();
    const nodes = this.registry.getAllNodes();

    const nodeDetails = nodes.map(node => ({
      id: node.id,
      name: node.name,
      status: node.status,
      type: node.type,
      host: node.host,
      port: node.port,
      currentLoad: node.currentLoad,
      activeTasks: node.activeTasks.length,
      completedTasks: node.completedTasks,
      failedTasks: node.failedTasks,
      cpuUsage: node.cpuUsage,
      memoryUsage: node.memoryUsage,
      capacity: node.capacity,
      supportedAlgorithms: node.supportedAlgorithms,
      uptime: node.status === 'online' ? Date.now() - node.registeredAt : null,
    }));

    return {
      ...basicStats,
      nodes: nodeDetails,
      strategy: this.loadBalancer.strategy,
    };
  }

  async shutdown() {
    const nodes = this.registry.getAllNodes();
    for (const node of nodes) {
      try {
        await this.registry.unregisterNode(node.id);
      } catch (error) {
        logger.warn(`Error unregistering node ${node.id}:`, error.message);
      }
    }
    this.registry.clear();
    logger.info('Node manager shutdown complete');
  }
}

const nodeManager = new NodeManager();

module.exports = {
  NodeManager,
  nodeManager,
};
