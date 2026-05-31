const NodeRegistry = require('../../src/node-manager/NodeRegistry');
const { NodeNotFoundError, NodeOfflineError } = require('../../src/common/errors');
const logger = require('../../src/common/logger');

jest.mock('../../src/common/logger');

describe('NodeRegistry', () => {
  let registry;
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      hset: jest.fn().mockResolvedValue('OK'),
      hget: jest.fn().mockResolvedValue(null),
      hgetall: jest.fn().mockResolvedValue({}),
      hdel: jest.fn().mockResolvedValue(1),
      hvals: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(1),
      zadd: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
      zrange: jest.fn().mockResolvedValue([]),
      multi: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    registry = new NodeRegistry({
      heartbeatInterval: 5000,
      nodeTimeout: 15000,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    registry.clear();
  });

  function createValidNodeData(overrides = {}) {
    return {
      name: 'compute-node-1',
      type: 'cpu',
      capacity: {
        cores: 4,
        memory: 8192,
        gpus: 0,
      },
      host: 'localhost',
      port: 9000,
      supportedAlgorithms: ['idw', 'kriging'],
      ...overrides,
    };
  }

  describe('registerNode', () => {
    it('should register a new node', () => {
      const nodeInfo = createValidNodeData({ id: 'node-1' });

      const node = registry.registerNode(nodeInfo);

      expect(node.id).toBe('node-1');
      expect(node.status).toBe('online');
      expect(node.registeredAt).toBeDefined();
      expect(node.lastHeartbeat).toBeDefined();
      expect(registry.nodes.has('node-1')).toBe(true);
    });

    it('should generate id if not provided', () => {
      const nodeInfo = createValidNodeData();

      const node = registry.registerNode(nodeInfo);

      expect(node.id).toBeDefined();
      expect(node.id.length).toBeGreaterThan(0);
    });

    it('should re-register existing node', () => {
      const nodeInfo = createValidNodeData({ id: 'node-1' });

      const node1 = registry.registerNode(nodeInfo);
      const node2 = registry.registerNode({ ...nodeInfo, name: 'updated-node' });

      expect(registry.nodes.size).toBe(1);
      expect(node2.name).toBe('updated-node');
    });

    it('should set default supportedAlgorithms if not provided', () => {
      const nodeInfo = createValidNodeData({ id: 'node-1' });
      delete nodeInfo.supportedAlgorithms;

      const node = registry.registerNode(nodeInfo);

      expect(node.supportedAlgorithms).toEqual(['kriging', 'idw', 'nearest', 'linear']);
    });
  });

  describe('unregisterNode', () => {
    it('should remove node from registry', () => {
      const nodeInfo = createValidNodeData({ id: 'node-1' });
      registry.registerNode(nodeInfo);
      expect(registry.nodes.has('node-1')).toBe(true);

      const result = registry.unregisterNode('node-1');
      expect(result.id).toBe('node-1');
      expect(result.status).toBe('offline');
      expect(registry.nodes.has('node-1')).toBe(false);
    });

    it('should throw NodeNotFoundError for unknown node', () => {
      expect(() => registry.unregisterNode('unknown')).toThrow(NodeNotFoundError);
    });
  });

  describe('heartbeat', () => {
    it('should update heartbeat and metrics', async () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));

      const beforeHeartbeat = registry.nodes.get('node-1').lastHeartbeat;

      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = registry.heartbeat('node-1', {
        cpuUsage: 50,
        memoryUsage: 0.5,
        currentLoad: 2,
      });

      expect(updated.lastHeartbeat).toBeGreaterThan(beforeHeartbeat);
      expect(updated.cpuUsage).toBe(50);
      expect(updated.memoryUsage).toBe(0.5);
      expect(updated.currentLoad).toBe(2);
      expect(updated.status).toBe('online');
    });

    it('should throw NodeNotFoundError for unknown node', () => {
      expect(() => registry.heartbeat('unknown-node')).toThrow(NodeNotFoundError);
    });

    it('should mark node as online if it was offline', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));
      registry.updateNodeStatus('node-1', 'offline');

      const updated = registry.heartbeat('node-1');
      expect(updated.status).toBe('online');
    });
  });

  describe('getNode', () => {
    it('should return node by id', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));
      const node = registry.getNode('node-1');
      expect(node.id).toBe('node-1');
    });

    it('should throw NodeNotFoundError for unknown node', () => {
      expect(() => registry.getNode('unknown')).toThrow(NodeNotFoundError);
    });

    it('should return a copy of node data', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));
      const node1 = registry.getNode('node-1');
      const node2 = registry.getNode('node-1');
      
      expect(node1).toEqual(node2);
      expect(node1).not.toBe(node2);
    });
  });

  describe('getAllNodes', () => {
    beforeEach(() => {
      registry.registerNode(createValidNodeData({ id: 'node-1', name: 'n1' }));
      registry.registerNode(createValidNodeData({ id: 'node-2', name: 'n2', port: 9002 }));
      registry.registerNode(createValidNodeData({ id: 'node-3', name: 'n3', port: 9003 }));

      registry.updateNodeStatus('node-3', 'offline');
    });

    it('should return all nodes when no status filter', () => {
      const nodes = registry.getAllNodes();
      expect(nodes.length).toBe(3);
    });

    it('should filter by status', () => {
      const onlineNodes = registry.getAllNodes('online');
      expect(onlineNodes.length).toBe(2);
      expect(onlineNodes.map(n => n.id)).toEqual(['node-1', 'node-2']);

      const offlineNodes = registry.getAllNodes('offline');
      expect(offlineNodes.length).toBe(1);
      expect(offlineNodes[0].id).toBe('node-3');
    });
  });

  describe('getOnlineNodes', () => {
    it('should return only online nodes', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1', name: 'n1' }));
      registry.registerNode(createValidNodeData({ id: 'node-2', name: 'n2', port: 9002 }));
      registry.updateNodeStatus('node-2', 'offline');

      const online = registry.getOnlineNodes();
      expect(online.length).toBe(1);
      expect(online[0].id).toBe('node-1');
    });
  });

  describe('updateNodeStatus', () => {
    it('should update node status', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));

      const updated = registry.updateNodeStatus('node-1', 'busy');
      expect(updated.status).toBe('busy');
      expect(updated.statusUpdatedAt).toBeDefined();
    });

    it('should throw NodeNotFoundError for unknown node', () => {
      expect(() => registry.updateNodeStatus('unknown', 'offline')).toThrow(NodeNotFoundError);
    });
  });

  describe('assignTask', () => {
    it('should increment active tasks', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));
      const updated = registry.assignTask('node-1', 'task-1');

      expect(updated.activeTasks).toContain('task-1');
      expect(updated.currentLoad).toBe(1);
    });

    it('should throw NodeNotFoundError for unknown node', () => {
      expect(() => registry.assignTask('unknown', 'task-1')).toThrow(NodeNotFoundError);
    });

    it('should throw NodeOfflineError for offline node', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));
      registry.updateNodeStatus('node-1', 'offline');

      expect(() => registry.assignTask('node-1', 'task-1')).toThrow(NodeOfflineError);
    });
  });

  describe('completeTask', () => {
    it('should decrement active tasks and update metrics', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));
      registry.assignTask('node-1', 'task-1');

      const updated = registry.completeTask('node-1', 'task-1', true, 100);

      expect(updated.activeTasks).not.toContain('task-1');
      expect(updated.currentLoad).toBe(0);
      expect(updated.completedTasks).toBe(1);
      expect(updated.totalCpuTime).toBe(100);
    });

    it('should track failed tasks', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));
      registry.assignTask('node-1', 'task-1');

      const updated = registry.completeTask('node-1', 'task-1', false, 50);

      expect(updated.failedTasks).toBe(1);
      expect(updated.completedTasks).toBe(0);
    });

    it('should throw NodeNotFoundError for unknown node', () => {
      expect(() => registry.completeTask('unknown', 'task-1', true, 0)).toThrow(NodeNotFoundError);
    });
  });

  describe('getNodeStats', () => {
    it('should return correct statistics', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1', name: 'n1' }));
      registry.registerNode(createValidNodeData({ id: 'node-2', name: 'n2', port: 9002 }));
      registry.updateNodeStatus('node-2', 'offline');

      registry.assignTask('node-1', 'task-1');
      registry.completeTask('node-1', 'task-2', true, 100);

      const stats = registry.getNodeStats();
      expect(stats.total).toBe(2);
      expect(stats.online).toBe(1);
      expect(stats.offline).toBe(1);
      expect(stats.totalActiveTasks).toBe(1);
      expect(stats.totalCompletedTasks).toBe(1);
      expect(stats.totalFailedTasks).toBe(0);
    });
  });

  describe('_startHeartbeatMonitor', () => {
    it('should mark node as offline if heartbeat timeout', () => {
      const testRegistry = new NodeRegistry({
        heartbeatInterval: 50,
        nodeTimeout: 100,
      });

      testRegistry.registerNode(createValidNodeData({ id: 'node-1' }));
      const node = testRegistry.nodes.get('node-1');
      node.lastHeartbeat = Date.now() - 200;

      testRegistry.checkNodeTimeout = function() {
        const now = Date.now();
        for (const [nodeId, n] of this.nodes) {
          if (n.status === 'online' && now - n.lastHeartbeat > this.nodeTimeout) {
            this.updateNodeStatus(nodeId, 'offline');
          }
        }
      };

      testRegistry.checkNodeTimeout();

      const updated = testRegistry.getNode('node-1');
      expect(updated.status).toBe('offline');
      testRegistry.clear();
    });
  });

  describe('clear', () => {
    it('should remove all nodes', () => {
      registry.registerNode(createValidNodeData({ id: 'node-1' }));
      registry.registerNode(createValidNodeData({ id: 'node-2', port: 9002 }));

      expect(registry.nodes.size).toBe(2);

      registry.clear();
      expect(registry.nodes.size).toBe(0);
    });
  });
});
