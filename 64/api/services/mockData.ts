import {
  Node,
  NodeStatus,
  Task,
  TaskStatus,
  TaskShard,
  NodeMetrics,
  CalculationResult,
  Alert,
  DashboardStats,
  CalculationParameters,
  SoilProperties,
  LoadCondition,
  BoundaryCondition,
  ResultMetadata,
  WriteStatus,
  NodePerformance
} from '../../shared/types';

function randomBetween(min: number, max: number, decimals = 2): number {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomDate(daysBack: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  date.setHours(Math.floor(Math.random() * 24));
  date.setMinutes(Math.floor(Math.random() * 60));
  return date;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

const nodeNames = ['计算节点-01', '计算节点-02', '计算节点-03', '计算节点-04', '计算节点-05'];
const nodeStatuses: NodeStatus[] = [NodeStatus.ONLINE, NodeStatus.OFFLINE, NodeStatus.BUSY];

function generateNodePerformance(): NodePerformance {
  const completedTasks = randomBetween(30, 150, 0);
  const failedTasks = randomBetween(0, 10, 0);
  const averageComputeTime = randomBetween(120, 600);
  const resultDeviationRate = randomBetween(0.005, 0.03);
  const performanceScore = randomBetween(70, 98);
  
  const lastTenResults = [];
  for (let i = 0; i < 10; i++) {
    lastTenResults.push({
      shardId: `shard-hist-${generateId()}`,
      computeTime: randomBetween(100, 700),
      deviation: randomBetween(0.001, 0.04)
    });
  }
  
  return {
    completedTasks,
    failedTasks,
    averageComputeTime,
    resultDeviationRate,
    performanceScore,
    lastTenResults
  };
}

export function generateMockNodes(count = 5): Node[] {
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    const status = randomItem(nodeStatuses);
    const isActive = status === NodeStatus.ONLINE || status === NodeStatus.BUSY;
    const performance = generateNodePerformance();
    nodes.push({
      id: `node-${i + 1}`,
      name: nodeNames[i] || `计算节点-${String(i + 1).padStart(2, '0')}`,
      ipAddress: `192.168.1.${100 + i}`,
      status,
      cpuUsage: isActive ? randomBetween(15, 95) : randomBetween(0, 10),
      memoryUsage: isActive ? randomBetween(30, 85) : randomBetween(10, 25),
      diskUsage: randomBetween(40, 75),
      networkUsage: isActive ? randomBetween(5, 60) : randomBetween(0, 3),
      runningTasks: status === NodeStatus.BUSY ? randomBetween(1, 3, 0) : 0,
      totalTasks: randomBetween(50, 200, 0),
      maxConcurrentTasks: randomBetween(4, 8, 0),
      lastHeartbeat: isActive ? new Date(Date.now() - randomBetween(0, 60000, 0)) : new Date(Date.now() - randomBetween(3600000, 86400000, 0)),
      registeredAt: randomDate(30),
      performance
    });
  }
  return nodes;
}

const taskNames = [
  '基坑支护结构沉降分析',
  '隧道围岩应力场模拟',
  '高层建筑地基承载力计算',
  '边坡稳定性有限元分析',
  '地铁车站结构抗震计算',
  '软土地基固结沉降预测',
  '地下管廊结构受力分析',
  '大坝渗流场数值模拟',
  '桩基承台共同作用分析',
  '地下洞室群围岩稳定性'
];

const taskStatuses: TaskStatus[] = [
  TaskStatus.PENDING,
  TaskStatus.QUEUED,
  TaskStatus.RUNNING,
  TaskStatus.COMPLETED,
  TaskStatus.FAILED
];

function generateSoilProperties(): SoilProperties {
  return {
    youngModulus: randomBetween(15, 35) * 1e6,
    poissonRatio: randomBetween(0.25, 0.4),
    density: randomBetween(1800, 2200),
    cohesion: randomBetween(15, 50) * 1e3,
    frictionAngle: randomBetween(15, 35)
  };
}

function generateLoadConditions(): LoadCondition[] {
  const count = randomBetween(1, 3, 0);
  const conditions: LoadCondition[] = [];
  for (let i = 0; i < count; i++) {
    conditions.push({
      x: randomBetween(0, 100),
      y: randomBetween(0, 50),
      magnitude: randomBetween(100, 500) * 1e3,
      area: randomBetween(4, 25)
    });
  }
  return conditions;
}

function generateBoundaryConditions(): BoundaryCondition[] {
  return [
    { type: 'fixed', xMin: true },
    { type: 'roller', yMin: true },
    { type: 'free', xMax: true, yMax: true }
  ];
}

function generateCalculationParameters(): CalculationParameters {
  return {
    gridSize: randomBetween(20, 30, 0),
    timeSteps: randomBetween(20, 50, 0),
    soilProperties: generateSoilProperties(),
    loadConditions: generateLoadConditions(),
    boundaryConditions: generateBoundaryConditions()
  };
}

export function generateMockTasks(count = 10): Task[] {
  const tasks: Task[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const status = taskStatuses[i % taskStatuses.length];
    const createdAt = new Date(now - randomBetween(0, 7 * 24 * 60 * 60 * 1000, 0));
    let startedAt: Date | null = null;
    let completedAt: Date | null = null;
    let progress = 0;
    let completedShards = 0;
    const totalShards = randomBetween(4, 8, 0);

    if (status === TaskStatus.RUNNING || status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      startedAt = new Date(createdAt.getTime() + randomBetween(1000, 30 * 60 * 1000, 0));
      if (status === TaskStatus.RUNNING) {
        progress = randomBetween(10, 90);
        completedShards = Math.floor(totalShards * (progress / 100));
      }
    }
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      completedAt = new Date(startedAt!.getTime() + randomBetween(30 * 60 * 1000, 4 * 60 * 60 * 1000, 0));
      progress = status === TaskStatus.COMPLETED ? 100 : randomBetween(20, 80);
      completedShards = status === TaskStatus.COMPLETED ? totalShards : Math.floor(totalShards * (progress / 100));
    }

    tasks.push({
      id: `task-${i + 1}`,
      name: taskNames[i] || `数值计算任务-${String(i + 1).padStart(3, '0')}`,
      userId: `user-${randomBetween(1, 5, 0)}`,
      modelFile: Math.random() > 0.3 ? `model_${generateId()}.json` : undefined,
      parameters: generateCalculationParameters(),
      priority: randomBetween(1, 10, 0),
      status,
      progress,
      totalShards,
      completedShards,
      createdAt,
      startedAt,
      completedAt,
      errorMessage: status === TaskStatus.FAILED ? randomItem([
        '计算不收敛，迭代次数超限',
        '内存不足，任务被终止',
        '节点连接中断，计算失败',
        '参数验证错误，边界条件冲突'
      ]) : undefined
    });
  }
  return tasks;
}

export function generateMockTaskShards(tasks: Task[], nodes: Node[]): TaskShard[] {
  const shards: TaskShard[] = [];
  const onlineNodes = nodes.filter(n => n.status !== NodeStatus.OFFLINE);

  tasks.forEach(task => {
    for (let i = 0; i < task.totalShards; i++) {
      const shardStatus = (() => {
        if (task.status === TaskStatus.COMPLETED) return TaskStatus.COMPLETED;
        if (task.status === TaskStatus.FAILED) return i < task.completedShards ? TaskStatus.COMPLETED : TaskStatus.FAILED;
        if (task.status === TaskStatus.RUNNING) return i < task.completedShards ? TaskStatus.COMPLETED : (i === task.completedShards ? TaskStatus.RUNNING : TaskStatus.QUEUED);
        return task.status;
      })();

      const createdAt = new Date(task.createdAt.getTime() + i * 5000);
      let startedAt: Date | null = null;
      let completedAt: Date | null = null;
      let progress = 0;
      let lastCheckpoint = undefined;
      let lastCheckpointAt = undefined;
      const retryCount = shardStatus === TaskStatus.FAILED ? randomBetween(1, 3, 0) : 0;

      if (shardStatus === TaskStatus.RUNNING || shardStatus === TaskStatus.COMPLETED) {
        startedAt = new Date(createdAt.getTime() + randomBetween(1000, 60000, 0));
        progress = shardStatus === TaskStatus.RUNNING ? randomBetween(20, 90) : 100;
        
        if (shardStatus === TaskStatus.RUNNING && progress > 30) {
          const checkpointStep = Math.floor(task.parameters.timeSteps * (progress / 100));
          const gridSize = task.parameters.gridSize;
          lastCheckpoint = {
            progress,
            partialSettlement: generate2DData(gridSize, gridSize, randomBetween(0.005, 0.05), 0.002),
            partialStress: generate2DData(gridSize, gridSize, randomBetween(100, 200) * 1e3, 20e3),
            partialDisplacement: generate2DData(gridSize, gridSize, randomBetween(0.01, 0.1), 0.005),
            currentStep: checkpointStep,
            timestamp: new Date()
          };
          lastCheckpointAt = new Date();
        }
      }
      if (shardStatus === TaskStatus.COMPLETED) {
        completedAt = new Date(startedAt!.getTime() + randomBetween(5 * 60 * 1000, 30 * 60 * 1000, 0));
      }

      shards.push({
        id: `shard-${task.id}-${i}`,
        taskId: task.id,
        nodeId: (shardStatus === TaskStatus.RUNNING || shardStatus === TaskStatus.COMPLETED) ? randomItem(onlineNodes).id : undefined,
        shardIndex: i,
        priority: task.priority,
        status: shardStatus,
        progress,
        retryCount,
        lastCheckpoint,
        lastCheckpointAt,
        createdAt,
        startedAt,
        completedAt,
        errorMessage: shardStatus === TaskStatus.FAILED ? '计算节点连接中断' : undefined
      });
    }
  });
  return shards;
}

export function generateMockNodeMetrics(nodeId: string, hours = 24, intervalMinutes = 5): NodeMetrics[] {
  const metrics: NodeMetrics[] = [];
  const now = Date.now();
  const points = (hours * 60) / intervalMinutes;
  const baseCpu = randomBetween(30, 50);
  const baseMemory = randomBetween(40, 60);

  for (let i = points; i >= 0; i--) {
    const timestamp = new Date(now - i * intervalMinutes * 60 * 1000);
    const wave = Math.sin(i * 0.1) * 15;
    const noise = (Math.random() - 0.5) * 10;

    metrics.push({
      nodeId,
      timestamp,
      cpu: Math.max(5, Math.min(98, baseCpu + wave + noise)),
      memory: Math.max(20, Math.min(95, baseMemory + wave * 0.5 + noise * 0.3)),
      disk: randomBetween(55, 70),
      network: Math.max(0, randomBetween(10, 50) + wave * 0.3),
      loadAverage: [
        randomBetween(0.5, 3),
        randomBetween(0.3, 2.5),
        randomBetween(0.2, 2)
      ]
    });
  }
  return metrics;
}

export function generateMockNodeMetricsHistory(nodes: Node[], hours = 24): NodeMetrics[] {
  const allMetrics: NodeMetrics[] = [];
  nodes.filter(n => n.status !== NodeStatus.OFFLINE).forEach(node => {
    allMetrics.push(...generateMockNodeMetrics(node.id, hours));
  });
  return allMetrics;
}

function generate2DData(rows: number, cols: number, baseValue: number, variance: number): number[][] {
  const data: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) {
      const distFromCenter = Math.sqrt(Math.pow(i - rows / 2, 2) + Math.pow(j - cols / 2, 2));
      const decay = Math.max(0, 1 - distFromCenter / (rows * 0.7));
      const wave = Math.sin(i * 0.3) * Math.cos(j * 0.2) * variance * 0.3;
      const noise = (Math.random() - 0.5) * variance * 0.2;
      row.push(Number((baseValue * decay + wave + noise).toFixed(6)));
    }
    data.push(row);
  }
  return data;
}

function calculateChecksum(data: number[][]): string {
  let hash = 0;
  for (const row of data) {
    for (const val of row) {
      hash = ((hash << 5) - hash + val) | 0;
    }
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

export function generateMockCalculationResult(shard: TaskShard, task: Task): CalculationResult {
  const gridSize = task.parameters.gridSize;
  const computeTime = randomBetween(180, 1200);
  const maxSettlement = randomBetween(0.01, 0.15);
  const maxStress = randomBetween(50, 300) * 1e3;

  const settlementData = generate2DData(gridSize, gridSize, maxSettlement, maxSettlement * 0.3);
  const stressData = generate2DData(gridSize, gridSize, maxStress, maxStress * 0.4);
  const displacementData = generate2DData(gridSize, gridSize, maxSettlement * 1.5, maxSettlement * 0.5);

  const metadata: ResultMetadata = {
    computeTime,
    maxSettlement,
    maxStress,
    convergence: Math.random() > 0.1
  };

  const checksumData = [...settlementData.flat(), ...stressData.flat(), ...displacementData.flat()];
  const checksum = calculateChecksum([checksumData]);

  return {
    id: `result-${shard.id}`,
    taskId: task.id,
    shardId: shard.id,
    nodeId: shard.nodeId!,
    settlementData,
    stressData,
    displacementData,
    metadata,
    checksum,
    writeStatus: WriteStatus.VERIFIED,
    writeAttempts: 1,
    createdAt: shard.completedAt || new Date(),
    verifiedAt: new Date()
  };
}

export function generateMockCalculationResults(shards: TaskShard[], tasks: Task[]): CalculationResult[] {
  const results: CalculationResult[] = [];
  const completedShards = shards.filter(s => s.status === TaskStatus.COMPLETED && s.nodeId);

  completedShards.forEach(shard => {
    const task = tasks.find(t => t.id === shard.taskId);
    if (task) {
      results.push(generateMockCalculationResult(shard, task));
    }
  });
  return results;
}

const alertMessages = {
  node: [
    '节点CPU使用率超过90%',
    '节点内存使用率超过85%',
    '节点心跳超时，可能已离线',
    '节点磁盘空间不足',
    '节点网络连接异常'
  ],
  task: [
    '任务执行时间超过预期',
    '任务计算不收敛，需要检查参数',
    '任务内存使用超限',
    '任务分配的节点离线，正在重试'
  ],
  system: [
    '任务队列堆积，建议增加计算节点',
    '系统负载过高，建议调整任务调度策略',
    '数据库连接池使用率过高',
    'API响应时间超出阈值'
  ]
};

export function generateMockAlerts(count = 8): Alert[] {
  const alerts: Alert[] = [];
  const types: Array<'node' | 'task' | 'system'> = ['node', 'task', 'system'];
  const levels: Array<'info' | 'warning' | 'error' | 'critical'> = ['info', 'warning', 'error', 'critical'];

  for (let i = 0; i < count; i++) {
    const type = randomItem(types);
    const level = i < 2 ? 'critical' : randomItem(levels);
    alerts.push({
      id: `alert-${generateId()}`,
      type,
      level,
      message: randomItem(alertMessages[type]),
      timestamp: new Date(Date.now() - randomBetween(0, 24 * 60 * 60 * 1000, 0)),
      resolved: Math.random() > 0.6
    });
  }
  return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function generateMockDashboardStats(nodes: Node[], tasks: Task[]): DashboardStats {
  const onlineNodes = nodes.filter(n => n.status === NodeStatus.ONLINE || n.status === NodeStatus.BUSY);
  const activeNodes = nodes.filter(n => n.status !== NodeStatus.OFFLINE);

  return {
    totalNodes: nodes.length,
    onlineNodes: onlineNodes.length,
    totalTasks: tasks.length,
    runningTasks: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
    completedTasks: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
    failedTasks: tasks.filter(t => t.status === TaskStatus.FAILED).length,
    pendingTasks: tasks.filter(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.QUEUED).length,
    avgCpuUsage: activeNodes.length > 0
      ? Number((activeNodes.reduce((sum, n) => sum + n.cpuUsage, 0) / activeNodes.length).toFixed(1))
      : 0,
    avgMemoryUsage: activeNodes.length > 0
      ? Number((activeNodes.reduce((sum, n) => sum + n.memoryUsage, 0) / activeNodes.length).toFixed(1))
      : 0
  };
}

export function generateAllMockData() {
  const nodes = generateMockNodes(5);
  const tasks = generateMockTasks(10);
  const taskShards = generateMockTaskShards(tasks, nodes);
  const nodeMetricsHistory = generateMockNodeMetricsHistory(nodes, 24);
  const calculationResults = generateMockCalculationResults(taskShards, tasks);
  const alerts = generateMockAlerts(8);
  const dashboardStats = generateMockDashboardStats(nodes, tasks);

  return {
    nodes,
    tasks,
    taskShards,
    nodeMetricsHistory,
    calculationResults,
    alerts,
    dashboardStats
  };
}
