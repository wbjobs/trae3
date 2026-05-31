export enum TaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  DISPATCHED = 'dispatched',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

export enum NodeStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
  IDLE = 'idle',
  ERROR = 'error',
}

export enum PhaseType {
  GAS = 'gas',
  LIQUID = 'liquid',
  SOLID = 'solid',
  MIXTURE = 'mixture',
}

export interface CFDParameters {
  domain: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    zMin: number;
    zMax: number;
  };
  mesh: {
    xCells: number;
    yCells: number;
    zCells: number;
    refinementLevel?: number;
  };
  phases: Array<{
    type: PhaseType;
    name: string;
    density: number;
    viscosity: number;
    volumeFraction?: number;
  }>;
  boundaryConditions: {
    inlet?: {
      velocity: { x: number; y: number; z: number };
      pressure?: number;
    };
    outlet?: {
      pressure: number;
    };
    walls?: Array<{
      name: string;
      type: 'no-slip' | 'slip' | 'symmetry';
    }>;
  };
  simulation: {
    startTime: number;
    endTime: number;
    timeStep: number;
    writeInterval: number;
    solver: 'simpleFoam' | 'pimpleFoam' | 'interFoam' | 'reactingFoam';
    turbulenceModel: 'k-epsilon' | 'k-omega' | 'laminar' | 'LES';
  };
}

export interface TaskChunk {
  id: string;
  taskId: string;
  chunkIndex: number;
  totalChunks: number;
  subDomain: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    zMin: number;
    zMax: number;
  };
  parameters: CFDParameters;
  status: TaskStatus;
  assignedNode?: string;
  startTime?: Date;
  endTime?: Date;
  resultPath?: string;
  error?: string;
  retryCount?: number;
  checksum?: string;
  estimatedCellCount?: number;
  weight?: number;
  checkpointTime?: number;
  checkpointPath?: string;
}

export interface ComputeTask {
  id: string;
  name: string;
  description?: string;
  parameters: CFDParameters;
  status: TaskStatus;
  priority: number;
  chunks: TaskChunk[];
  totalChunks: number;
  completedChunks: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
  tags?: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  error?: string;
}

export interface ComputeNode {
  id: string;
  name: string;
  hostname: string;
  port: number;
  status: NodeStatus;
  cpuCores: number;
  memoryGB: number;
  gpuCount?: number;
  currentLoad: number;
  memoryUsage: number;
  currentTask?: string;
  lastHeartbeat: Date;
  registeredAt: Date;
  capabilities: string[];
  totalTasksCompleted: number;
  totalComputeTime: number;
}

export interface TaskResult {
  id: string;
  taskId: string;
  chunkId: string;
  nodeId: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  variables: string[];
  timesteps: number[];
  createdAt: Date;
  checksum?: string;
  dataIntegrityVerified?: boolean;
  metadata?: Record<string, any>;
}

export interface WorkerMessage {
  type: 'task_start' | 'task_progress' | 'task_complete' | 'task_error' | 'heartbeat' | 'register';
  payload: any;
  nodeId?: string;
  timestamp: Date;
}

export interface TaskProgress {
  taskId: string;
  chunkId: string;
  progress: number;
  currentTimestep?: number;
  message?: string;
}
