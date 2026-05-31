export enum TaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum NodeStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
  IDLE = 'idle'
}

export enum PhaseType {
  GAS = 'gas',
  LIQUID = 'liquid',
  SOLID = 'solid',
  MIXTURE = 'mixture'
}

export interface CFDPhase {
  name: string;
  type: PhaseType;
  density: number;
  viscosity: number;
  volumeFraction: number;
}

export interface BoundaryCondition {
  name: string;
  type: 'inlet' | 'outlet' | 'wall' | 'symmetry';
  velocity?: number;
  pressure?: number;
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
  };
  phases: CFDPhase[];
  boundaryConditions: BoundaryCondition[];
  solver: {
    type: string;
    turbulenceModel: string;
    timeStep: number;
    endTime: number;
    writeInterval: number;
  };
}

export interface TaskChunk {
  id: string;
  taskId: string;
  index: number;
  status: TaskStatus;
  parameters: CFDParameters;
  assignedNode?: string;
  resultPath?: string;
  progress: number;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ComputeTask {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  priority: number;
  parameters: CFDParameters;
  chunks: TaskChunk[];
  totalChunks: number;
  completedChunks: number;
  createdBy: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
}

export interface ComputeNode {
  id: string;
  name: string;
  status: NodeStatus;
  cpuUsage: number;
  memoryUsage: number;
  totalMemory: number;
  cpuCores: number;
  currentTasks: string[];
  lastHeartbeat: Date;
  registeredAt: Date;
}

export interface TaskResult {
  id: string;
  taskId: string;
  chunkId?: string;
  resultPath: string;
  fileSize: number;
  variables: string[];
  timeSteps: number[];
  summary: Record<string, any>;
  createdAt: Date;
}

export interface BatchTaskRequest {
  name: string;
  description?: string;
  parameters: CFDParameters;
}
