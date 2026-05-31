export enum TaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RECOVERING = 'recovering',
  PREEMPTED = 'preempted'
}

export enum WriteStatus {
  PENDING = 'pending',
  WRITING = 'writing',
  VERIFIED = 'verified',
  FAILED = 'failed'
}

export enum NodeStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
  ERROR = 'error'
}

export interface SoilProperties {
  youngModulus: number;
  poissonRatio: number;
  density: number;
  cohesion: number;
  frictionAngle: number;
}

export interface LoadCondition {
  x: number;
  y: number;
  magnitude: number;
  area: number;
}

export interface BoundaryCondition {
  type: 'fixed' | 'roller' | 'free';
  xMin?: boolean;
  xMax?: boolean;
  yMin?: boolean;
  yMax?: boolean;
}

export interface AdvancedCalculationOptions {
  enableAdaptiveTimeStepping?: boolean;
  targetError?: number;
  initialTimeStep?: number;
  maxTimeStep?: number;
  minTimeStep?: number;
  enableMultiLevelConvergence?: boolean;
  residualTolerance?: number;
  displacementTolerance?: number;
  energyTolerance?: number;
  requiredConvergenceCriteria?: ('residual' | 'displacement' | 'energy')[];
  maxIterations?: number;
  enableDuncanChangModel?: boolean;
  duncanChangParams?: DuncanChangParameters;
  enableMeshAdaptivity?: boolean;
  stressGradientThreshold?: number;
  enableLineSearch?: boolean;
  enableAitkenAcceleration?: boolean;
}

export interface DuncanChangParameters {
  Ei?: number;
  Rf?: number;
  K?: number;
  n?: number;
  Kur?: number;
  c?: number;
  phi?: number;
  pa?: number;
}

export interface ConvergenceState {
  residualConverged: boolean;
  displacementConverged: boolean;
  energyConverged: boolean;
  residual: number;
  displacementChange: number;
  energyChange: number;
  isConverged: boolean;
  iteration: number;
}

export interface MeshRefinementSuggestion {
  regions: { i: number; j: number; level: number }[];
  qualityScore: number;
  maxStressGradient: number;
}

export interface CalculationParameters {
  gridSize: number;
  timeSteps: number;
  soilProperties: SoilProperties;
  loadConditions: LoadCondition[];
  boundaryConditions: BoundaryCondition[];
  advancedOptions?: AdvancedCalculationOptions;
}

export interface PriorityChange {
  oldPriority: number;
  newPriority: number;
  changedBy: string;
  changedAt: Date;
  reason?: string;
}

export interface Task {
  id: string;
  name: string;
  userId: string;
  modelFile?: string;
  parameters: CalculationParameters;
  priority: number;
  priorityHistory?: PriorityChange[];
  status: TaskStatus;
  progress: number;
  totalShards: number;
  completedShards: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage?: string;
}

export interface CheckpointData {
  progress: number;
  partialSettlement: number[][];
  partialStress: number[][];
  partialDisplacement: number[][];
  currentStep: number;
  timestamp: Date;
}

export interface TaskShard {
  id: string;
  taskId: string;
  nodeId?: string;
  shardIndex: number;
  priority: number;
  status: TaskStatus;
  progress: number;
  retryCount: number;
  lastCheckpoint?: CheckpointData;
  lastCheckpointAt?: Date;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage?: string;
}

export interface TaskResult {
  shardId: string;
  timestamp: Date;
  taskId: string;
  nodeId?: string;
  shardIndex: number;
}

export interface NodePerformanceResult {
  shardId: string;
  computeTime: number;
  deviation: number;
}

export interface NodePerformance {
  completedTasks: number;
  failedTasks: number;
  averageComputeTime: number;
  resultDeviationRate: number;
  performanceScore: number;
  lastTenResults: NodePerformanceResult[];
  isolationReason?: string;
  isolatedAt?: Date;
}

export interface Node {
  id: string;
  name: string;
  ipAddress: string;
  status: NodeStatus;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkUsage: number;
  runningTasks: number;
  totalTasks: number;
  maxConcurrentTasks: number;
  lastHeartbeat: Date;
  registeredAt: Date;
  performance: NodePerformance;
}

export interface NodeMetrics {
  nodeId: string;
  timestamp: Date;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  loadAverage: number[];
}

export interface ResultMetadata {
  computeTime: number;
  maxSettlement: number;
  maxStress: number;
  convergence: boolean;
  convergenceIterations?: number[];
  adaptiveSteps?: number;
  finalError?: number;
  computationStability?: number;
  meshQuality?: number;
  timeStepHistory?: number[];
  errorHistory?: number[];
  residualHistory?: number[];
  finalConvergenceState?: ConvergenceState;
}

export interface CalculationResult {
  id: string;
  taskId: string;
  shardId: string;
  nodeId: string;
  settlementData: number[][];
  stressData: number[][];
  displacementData: number[][];
  metadata: ResultMetadata;
  checksum?: string;
  writeStatus?: WriteStatus;
  writeAttempts?: number;
  createdAt: Date;
  verifiedAt?: Date;
  verificationLevel?: number;
  verificationScore?: number;
}

export interface WriteTransaction {
  id: string;
  taskId: string;
  shardIds: string[];
  status: 'preparing' | 'committed' | 'rolled_back';
  checksum: string;
  createdAt: Date;
  committedAt?: Date;
}

export interface CreateTaskRequest {
  name: string;
  parameters: CalculationParameters;
  priority: number;
  modelFile?: File;
}

export interface CreateTaskResponse {
  taskId: string;
  status: TaskStatus;
  estimatedTime: number;
  message: string;
}

export interface TaskListResponse {
  total: number;
  items: Task[];
  page: number;
  pageSize: number;
}

export interface DashboardStats {
  totalNodes: number;
  onlineNodes: number;
  totalTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgCpuUsage: number;
  avgMemoryUsage: number;
  pendingTasks: number;
}

export interface Alert {
  id: string;
  type: 'node' | 'task' | 'system';
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'operator';
  createdAt: Date;
  lastLogin: Date | null;
}

export interface PerformanceTrendPoint {
  timestamp: Date;
  performanceScore: number;
  deviationRate: number;
  completedTasks: number;
}
