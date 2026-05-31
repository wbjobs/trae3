const LoadBalancer = require('../../src/node-manager/LoadBalancer');
const logger = require('../../src/common/logger');

jest.mock('../../src/common/logger');

describe('LoadBalancer', () => {
  let loadBalancer;
  let testNodes;

  beforeEach(() => {
    loadBalancer = new LoadBalancer();
    testNodes = [
      {
        id: 'node-1',
        status: 'online',
        currentLoad: 2,
        cpuUsage: 30,
        memoryUsage: 0.125,
        capacity: { cores: 4, memory: 8192 },
        avgResponseTime: 100,
        totalTasksCompleted: 50,
        lastHeartbeat: Date.now(),
        supportedAlgorithms: ['kriging', 'idw'],
      },
      {
        id: 'node-2',
        status: 'online',
        currentLoad: 1,
        cpuUsage: 60,
        memoryUsage: 0.25,
        capacity: { cores: 4, memory: 8192 },
        avgResponseTime: 200,
        totalTasksCompleted: 100,
        lastHeartbeat: Date.now(),
        supportedAlgorithms: ['idw', 'nearest'],
      },
      {
        id: 'node-3',
        status: 'online',
        currentLoad: 5,
        cpuUsage: 80,
        memoryUsage: 0.5,
        capacity: { cores: 8, memory: 16384 },
        avgResponseTime: 150,
        totalTasksCompleted: 75,
        lastHeartbeat: Date.now(),
        supportedAlgorithms: ['kriging', 'idw', 'nearest', 'linear'],
      },
      {
        id: 'node-4',
        status: 'offline',
        currentLoad: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        capacity: { cores: 4, memory: 8192 },
        avgResponseTime: 0,
        totalTasksCompleted: 20,
        lastHeartbeat: Date.now() - 60000,
        supportedAlgorithms: ['idw'],
      },
    ];
  });

  describe('constructor', () => {
    it('should use default strategy if not specified', () => {
      expect(loadBalancer.strategy).toBe('adaptive');
    });

    it('should accept custom strategy', () => {
      const lb = new LoadBalancer('round-robin');
      expect(lb.strategy).toBe('round-robin');
    });
  });

  describe('setStrategy', () => {
    it('should set valid strategy', () => {
      loadBalancer.setStrategy('cpu-usage');
      expect(loadBalancer.strategy).toBe('cpu-usage');
    });

    it('should set any strategy without validation', () => {
      loadBalancer.setStrategy('invalid');
      expect(loadBalancer.strategy).toBe('invalid');
    });
  });

  describe('getAvailableStrategies', () => {
    it('should return all available strategies', () => {
      const strategies = loadBalancer.getAvailableStrategies();
      expect(Array.isArray(strategies)).toBe(true);
      expect(strategies.length).toBe(7);
      expect(strategies).toContain('adaptive');
      expect(strategies).toContain('least-connections');
      expect(strategies).toContain('round-robin');
      expect(strategies).toContain('weighted-response');
      expect(strategies).toContain('cpu-usage');
      expect(strategies).toContain('memory-available');
      expect(strategies).toContain('random');
    });
  });

  describe('_leastConnections', () => {
    it('should select node with least currentLoad', () => {
      const onlineNodes = testNodes.filter(n => n.status === 'online');
      const selected = loadBalancer._leastConnections(onlineNodes);
      expect(selected.id).toBe('node-2');
      expect(selected.currentLoad).toBe(1);
    });

    it('should fallback to activeTasks.length if currentLoad not available', () => {
      const nodes = [
        { id: 'n1', status: 'online', activeTasks: [1, 2, 3] },
        { id: 'n2', status: 'online', activeTasks: [1] },
      ];
      const selected = loadBalancer._leastConnections(nodes);
      expect(selected.id).toBe('n2');
    });
  });

  describe('_roundRobin', () => {
    it('should cycle through nodes', () => {
      const lb = new LoadBalancer('round-robin');
      const onlineNodes = testNodes.filter(n => n.status === 'online');
      const selectedIds = [];

      for (let i = 0; i < 6; i++) {
        const selected = lb._roundRobin(onlineNodes);
        selectedIds.push(selected.id);
      }

      expect(selectedIds[0]).toBe(onlineNodes[0].id);
      expect(selectedIds[1]).toBe(onlineNodes[1].id);
      expect(selectedIds[2]).toBe(onlineNodes[2].id);
      expect(selectedIds[3]).toBe(onlineNodes[0].id);
    });
  });

  describe('_weightedResponse', () => {
    it('should select node with highest score', () => {
      const onlineNodes = testNodes.filter(n => n.status === 'online');
      const selected = loadBalancer._weightedResponse(onlineNodes);
      expect(selected).not.toBeNull();
      expect(selected.status).toBe('online');
    });
  });

  describe('_cpuUsage', () => {
    it('should select node with lowest CPU usage', () => {
      const onlineNodes = testNodes.filter(n => n.status === 'online');
      const selected = loadBalancer._cpuUsage(onlineNodes);
      expect(selected.id).toBe('node-1');
      expect(selected.cpuUsage).toBe(30);
    });

    it('should handle nodes without cpuUsage', () => {
      const nodes = [
        { id: 'n1', status: 'online', cpuUsage: 80 },
        { id: 'n2', status: 'online' },
      ];
      const selected = loadBalancer._cpuUsage(nodes);
      expect(selected.id).toBe('n2');
    });
  });

  describe('_memoryAvailable', () => {
    it('should select node with lowest memoryUsage', () => {
      const onlineNodes = testNodes.filter(n => n.status === 'online');
      const selected = loadBalancer._memoryAvailable(onlineNodes);
      expect(selected.id).toBe('node-1');
      expect(selected.memoryUsage).toBe(0.125);
    });

    it('should handle nodes without memoryUsage', () => {
      const nodes = [
        { id: 'n1', status: 'online', memoryUsage: 0.8 },
        { id: 'n2', status: 'online' },
      ];
      const selected = loadBalancer._memoryAvailable(nodes);
      expect(selected.id).toBe('n1');
    });
  });

  describe('_random', () => {
    it('should select a random online node', () => {
      const onlineIds = testNodes.filter(n => n.status === 'online').map(n => n.id);
      const selected = loadBalancer._random(testNodes.filter(n => n.status === 'online'));
      expect(onlineIds).toContain(selected.id);
    });
  });

  describe('selectNode', () => {
    it('should use configured strategy', () => {
      loadBalancer.setStrategy('least-connections');
      const selected = loadBalancer.selectNode(testNodes);
      expect(selected.id).toBe('node-2');
    });

    it('should return null if no nodes available', () => {
      const selected = loadBalancer.selectNode([]);
      expect(selected).toBeNull();
    });

    it('should return null if all nodes are offline', () => {
      const offlineNodes = [{ id: 'offline-1', status: 'offline', currentLoad: 0 }];
      const selected = loadBalancer.selectNode(offlineNodes);
      expect(selected).toBeNull();
    });

    it('should use fallback to adaptive for unknown strategy', () => {
      loadBalancer.strategy = 'unknown';
      const selected = loadBalancer.selectNode(testNodes);
      expect(selected).not.toBeNull();
      expect(selected.status).toBe('online');
    });

    it('should filter nodes by algorithm support', () => {
      const task = {
        inputData: {
          params: { algorithm: 'kriging' },
        },
      };

      const selected = loadBalancer.selectNode(testNodes, task);
      expect(['node-1', 'node-3']).toContain(selected.id);
    });

    it('should fallback to all online nodes if no algorithm support', () => {
      const task = {
        inputData: {
          params: { algorithm: 'unknown-alg' },
        },
      };

      testNodes.forEach(n => n.supportedAlgorithms = ['idw']);
      const selected = loadBalancer.selectNode(testNodes, task);
      expect(selected).not.toBeNull();
      expect(selected.status).toBe('online');
    });

    it('should return all nodes if task has no algorithm', () => {
      const task = { inputData: {} };
      const selected = loadBalancer.selectNode(testNodes, task);
      expect(selected).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle single node', () => {
      const nodes = [testNodes[0]];
      const selected = loadBalancer.selectNode(nodes);
      expect(selected.id).toBe('node-1');
    });

    it('should handle nodes with zero capacity', () => {
      const nodes = [
        { id: 'n1', status: 'online', currentLoad: 1, cpuUsage: 50, memoryUsage: 0.5, capacity: { cores: 0, memory: 0 } },
      ];
      const selected = loadBalancer._weightedResponse(nodes);
      expect(selected.id).toBe('n1');
    });

    it('should handle task with null inputData', () => {
      const selected = loadBalancer.selectNode(testNodes, null);
      expect(selected).not.toBeNull();
    });

    it('should handle task without params', () => {
      const task = { inputData: {} };
      const selected = loadBalancer.selectNode(testNodes, task);
      expect(selected).not.toBeNull();
    });

    it('should handle node with empty supportedAlgorithms', () => {
      const nodes = [
        { id: 'n1', status: 'online', currentLoad: 1, supportedAlgorithms: [] },
      ];
      const task = { inputData: { params: { algorithm: 'kriging' } } };
      const selected = loadBalancer.selectNode(nodes, task);
      expect(selected.id).toBe('n1');
    });

    it('should handle node without supportedAlgorithms', () => {
      const nodes = [
        { id: 'n1', status: 'online', currentLoad: 1 },
      ];
      const task = { inputData: { params: { algorithm: 'kriging' } } };
      const selected = loadBalancer.selectNode(nodes, task);
      expect(selected.id).toBe('n1');
    });
  });
});
