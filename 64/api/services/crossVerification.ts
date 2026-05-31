import { Task, TaskShard, CalculationResult } from '../../shared/types.js';
import { dataSource } from './dataSource.js';

export enum VerificationLevel {
  LEVEL_0 = 0,
  LEVEL_1 = 1,
  LEVEL_2 = 2,
  LEVEL_3 = 3,
}

export interface VerificationResult {
  level: VerificationLevel;
  passed: boolean;
  score: number;
  message: string;
  details?: any;
}

export interface DualComputeResult {
  shardId: string;
  primaryNode: string;
  secondaryNode: string;
  primaryResult?: CalculationResult;
  secondaryResult?: CalculationResult;
  errorMatrix?: number[][];
  maxError: number;
  avgError: number;
  status: 'pending' | 'comparing' | 'passed' | 'warning' | 'failed';
}

export interface ShardConsistencyIssue {
  shardId1: string;
  shardId2: string;
  boundaryType: 'x' | 'y';
  maxJump: number;
  avgJump: number;
  threshold: number;
}

export interface PhysicalLawIssue {
  type: 'boundary' | 'equilibrium' | 'range';
  location: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface VerificationReport {
  taskId: string;
  verificationLevel: VerificationLevel;
  overallScore: number;
  overallPassed: boolean;
  levelResults: Map<VerificationLevel, VerificationResult>;
  dualComputeResults: DualComputeResult[];
  consistencyIssues: ShardConsistencyIssue[];
  physicalLawIssues: PhysicalLawIssue[];
  suspiciousShards: string[];
  generatedAt: Date;
}

export class CrossVerificationService {
  private static instance: CrossVerificationService;
  private readonly DEFAULT_VERIFICATION_LEVEL = VerificationLevel.LEVEL_2;
  private readonly HIGH_PRIORITY_THRESHOLD = 5;
  private readonly ERROR_THRESHOLD_WARNING = 0.01;
  private readonly ERROR_THRESHOLD_FAILURE = 0.05;
  private readonly CONSISTENCY_THRESHOLD = 0.001;
  private readonly SAMPLING_RATE = 0.1;
  private readonly BOUNDARY_SHARD_RATE = 0.2;

  private dualComputeCache: Map<string, DualComputeResult> = new Map();

  private constructor() {}

  static getInstance(): CrossVerificationService {
    if (!CrossVerificationService.instance) {
      CrossVerificationService.instance = new CrossVerificationService();
    }
    return CrossVerificationService.instance;
  }

  verifyPhysicalLaws(result: CalculationResult): VerificationResult {
    const issues: PhysicalLawIssue[] = [];
    let score = 100;

    const { settlementData, stressData, metadata } = result;
    const rows = settlementData.length;
    const cols = settlementData[0]?.length || 0;

    if (metadata.maxSettlement < 0 || metadata.maxSettlement > 10) {
      issues.push({
        type: 'range',
        location: 'settlement',
        message: `沉降值 ${metadata.maxSettlement.toFixed(4)}m 超出合理范围 [0, 10]m`,
        severity: 'high',
      });
      score -= 20;
    }

    if (metadata.maxStress < 0 || metadata.maxStress > 100000) {
      issues.push({
        type: 'range',
        location: 'stress',
        message: `应力值 ${metadata.maxStress.toFixed(2)}kPa 超出合理范围 [0, 100000]kPa`,
        severity: 'high',
      });
      score -= 20;
    }

    const boundaryTolerance = 0.01;
    for (let j = 0; j < cols; j++) {
      if (Math.abs(settlementData[0][j]) > boundaryTolerance) {
        issues.push({
          type: 'boundary',
          location: `top_boundary_col_${j}`,
          message: `顶部边界沉降 ${settlementData[0][j].toFixed(6)} 超出容差 ${boundaryTolerance}`,
          severity: 'medium',
        });
        score -= 5;
        break;
      }
    }

    let totalForce = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        totalForce += stressData[i][j];
      }
    }
    const avgForce = totalForce / (rows * cols);
    if (avgForce < 0.001 && metadata.maxStress > 1) {
      issues.push({
        type: 'equilibrium',
        location: 'force_balance',
        message: '应力分布异常，平均应力与最大应力差异过大',
        severity: 'medium',
      });
      score -= 15;
    }

    if (!metadata.convergence) {
      issues.push({
        type: 'equilibrium',
        location: 'convergence',
        message: '计算结果未收敛',
        severity: 'high',
      });
      score -= 30;
    }

    return {
      level: VerificationLevel.LEVEL_1,
      passed: score >= 70,
      score: Math.max(0, score),
      message: issues.length === 0 ? '物理定律校验通过' : `发现 ${issues.length} 个物理定律问题`,
      details: { issues },
    };
  }

  verifyShardConsistency(taskId: string): VerificationResult {
    const issues: ShardConsistencyIssue[] = [];
    const taskShards = dataSource.getShardsByTaskId(taskId);
    const results = dataSource.getResultsByTaskId(taskId);

    if (results.length < 2) {
      return {
        level: VerificationLevel.LEVEL_2,
        passed: true,
        score: 100,
        message: '分片数量不足，跳过一致性校验',
        details: { issues: [] },
      };
    }

    const shardResultMap = new Map<string, CalculationResult>();
    for (const result of results) {
      shardResultMap.set(result.shardId, result);
    }

    const gridSize = taskShards.length > 0 ? Math.ceil(Math.sqrt(taskShards.length)) : 1;
    const threshold = this.CONSISTENCY_THRESHOLD;

    for (let i = 0; i < taskShards.length; i++) {
      const shard1 = taskShards[i];
      const result1 = shardResultMap.get(shard1.id);
      if (!result1) continue;

      const rightIdx = (Math.floor(i / gridSize) * gridSize) + ((i + 1) % gridSize);
      if (rightIdx < taskShards.length && (i + 1) % gridSize !== 0) {
        const shard2 = taskShards[rightIdx];
        const result2 = shardResultMap.get(shard2.id);
        if (result2) {
          const issue = this.checkBoundaryContinuity(
            result1,
            result2,
            'x',
            threshold,
            shard1.id,
            shard2.id
          );
          if (issue) issues.push(issue);
        }
      }

      const bottomIdx = i + gridSize;
      if (bottomIdx < taskShards.length) {
        const shard2 = taskShards[bottomIdx];
        const result2 = shardResultMap.get(shard2.id);
        if (result2) {
          const issue = this.checkBoundaryContinuity(
            result1,
            result2,
            'y',
            threshold,
            shard1.id,
            shard2.id
          );
          if (issue) issues.push(issue);
        }
      }
    }

    const baseScore = 100;
    const penaltyPerIssue = 10;
    const score = Math.max(0, baseScore - issues.length * penaltyPerIssue);

    return {
      level: VerificationLevel.LEVEL_2,
      passed: score >= 70,
      score,
      message: issues.length === 0 ? '分片一致性校验通过' : `发现 ${issues.length} 个分片连续性问题`,
      details: { issues },
    };
  }

  private checkBoundaryContinuity(
    result1: CalculationResult,
    result2: CalculationResult,
    boundaryType: 'x' | 'y',
    threshold: number,
    shardId1: string,
    shardId2: string
  ): ShardConsistencyIssue | null {
    const data1 = result1.settlementData;
    const data2 = result2.settlementData;

    if (data1.length === 0 || data2.length === 0) return null;

    let maxJump = 0;
    let totalJump = 0;
    let count = 0;

    if (boundaryType === 'x') {
      const boundary1 = data1.map(row => row[row.length - 1]);
      const boundary2 = data2.map(row => row[0]);
      const len = Math.min(boundary1.length, boundary2.length);

      for (let i = 0; i < len; i++) {
        const jump = Math.abs(boundary1[i] - boundary2[i]);
        maxJump = Math.max(maxJump, jump);
        totalJump += jump;
        count++;
      }
    } else {
      const boundary1 = data1[data1.length - 1];
      const boundary2 = data2[0];
      const len = Math.min(boundary1.length, boundary2.length);

      for (let i = 0; i < len; i++) {
        const jump = Math.abs(boundary1[i] - boundary2[i]);
        maxJump = Math.max(maxJump, jump);
        totalJump += jump;
        count++;
      }
    }

    if (maxJump > threshold) {
      return {
        shardId1,
        shardId2,
        boundaryType,
        maxJump,
        avgJump: count > 0 ? totalJump / count : 0,
        threshold,
      };
    }

    return null;
  }

  selectDualComputeShards(task: Task): string[] {
    const shards = dataSource.getShardsByTaskId(task.id);
    const selectedShards: string[] = [];

    if (task.priority >= this.HIGH_PRIORITY_THRESHOLD) {
      return shards.map(s => s.id);
    }

    const sampleCount = Math.ceil(shards.length * this.SAMPLING_RATE);
    const boundaryCount = Math.ceil(shards.length * this.BOUNDARY_SHARD_RATE);

    const shuffled = [...shards].sort(() => Math.random() - 0.5);
    for (let i = 0; i < sampleCount && i < shuffled.length; i++) {
      if (!selectedShards.includes(shuffled[i].id)) {
        selectedShards.push(shuffled[i].id);
      }
    }

    const gridSize = Math.ceil(Math.sqrt(shards.length));
    for (const shard of shards) {
      const row = Math.floor(shard.shardIndex / gridSize);
      const col = shard.shardIndex % gridSize;
      const isBoundary = row === 0 || row === gridSize - 1 || col === 0 || col === gridSize - 1;

      if (isBoundary && selectedShards.length < sampleCount + boundaryCount) {
        if (!selectedShards.includes(shard.id)) {
          selectedShards.push(shard.id);
        }
      }
    }

    return selectedShards;
  }

  compareDualResults(result1: CalculationResult, result2: CalculationResult): DualComputeResult {
    const rows = Math.min(result1.settlementData.length, result2.settlementData.length);
    const cols = Math.min(result1.settlementData[0]?.length || 0, result2.settlementData[0]?.length || 0);

    const errorMatrix: number[][] = [];
    let maxError = 0;
    let totalError = 0;
    let count = 0;

    for (let i = 0; i < rows; i++) {
      const row: number[] = [];
      for (let j = 0; j < cols; j++) {
        const val1 = result1.settlementData[i][j];
        const val2 = result2.settlementData[i][j];
        const absMax = Math.max(Math.abs(val1), Math.abs(val2));
        const relError = absMax > 0 ? Math.abs(val1 - val2) / absMax : 0;

        row.push(relError);
        maxError = Math.max(maxError, relError);
        totalError += relError;
        count++;
      }
      errorMatrix.push(row);
    }

    const avgError = count > 0 ? totalError / count : 0;

    let status: DualComputeResult['status'] = 'passed';
    if (maxError > this.ERROR_THRESHOLD_FAILURE) {
      status = 'failed';
    } else if (maxError > this.ERROR_THRESHOLD_WARNING) {
      status = 'warning';
    }

    return {
      shardId: result1.shardId,
      primaryNode: result1.nodeId,
      secondaryNode: result2.nodeId,
      primaryResult: result1,
      secondaryResult: result2,
      errorMatrix,
      maxError,
      avgError,
      status,
    };
  }

  async getVerificationReport(taskId: string): Promise<VerificationReport> {
    const task = dataSource.getTaskById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const levelResults = new Map<VerificationLevel, VerificationResult>();
    let overallScore = 100;
    let overallPassed = true;

    const verificationLevel = task.priority >= this.HIGH_PRIORITY_THRESHOLD
      ? VerificationLevel.LEVEL_3
      : this.DEFAULT_VERIFICATION_LEVEL;

    const results = dataSource.getResultsByTaskId(taskId);
    const suspiciousShards: string[] = [];

    const formatResult: VerificationResult = {
      level: VerificationLevel.LEVEL_0,
      passed: true,
      score: 100,
      message: '格式校验通过',
    };
    levelResults.set(VerificationLevel.LEVEL_0, formatResult);

    let physicalLawIssues: PhysicalLawIssue[] = [];
    if (verificationLevel >= VerificationLevel.LEVEL_1) {
      let level1Score = 100;
      let allPassed = true;

      for (const result of results) {
        const verification = this.verifyPhysicalLaws(result);
        level1Score = Math.min(level1Score, verification.score);
        if (!verification.passed) {
          allPassed = false;
          suspiciousShards.push(result.shardId);
        }
        if (verification.details?.issues) {
          physicalLawIssues = [...physicalLawIssues, ...verification.details.issues];
        }
      }

      levelResults.set(VerificationLevel.LEVEL_1, {
        level: VerificationLevel.LEVEL_1,
        passed: allPassed,
        score: level1Score,
        message: allPassed ? '物理定律校验全部通过' : '部分分片物理定律校验失败',
        details: { issues: physicalLawIssues },
      });
      overallScore = Math.min(overallScore, level1Score);
      overallPassed = overallPassed && allPassed;
    }

    let consistencyIssues: ShardConsistencyIssue[] = [];
    if (verificationLevel >= VerificationLevel.LEVEL_2) {
      const consistencyResult = this.verifyShardConsistency(taskId);
      levelResults.set(VerificationLevel.LEVEL_2, consistencyResult);
      overallScore = Math.min(overallScore, consistencyResult.score);
      overallPassed = overallPassed && consistencyResult.passed;
      consistencyIssues = consistencyResult.details?.issues || [];
    }

    const dualComputeResults: DualComputeResult[] = [];
    if (verificationLevel >= VerificationLevel.LEVEL_3) {
      let level3Score = 100;
      let allPassed = true;

      const dualShardIds = this.selectDualComputeShards(task);
      for (const shardId of dualShardIds) {
        const cached = this.dualComputeCache.get(shardId);
        if (cached) {
          dualComputeResults.push(cached);
          if (cached.status === 'failed') {
            level3Score = Math.min(level3Score, 50);
            allPassed = false;
            suspiciousShards.push(shardId);
          } else if (cached.status === 'warning') {
            level3Score = Math.min(level3Score, 80);
          }
        }
      }

      levelResults.set(VerificationLevel.LEVEL_3, {
        level: VerificationLevel.LEVEL_3,
        passed: allPassed,
        score: level3Score,
        message: allPassed ? '双算核验全部通过' : '部分分片双算核验存在问题',
        details: { dualComputeCount: dualComputeResults.length },
      });
      overallScore = Math.min(overallScore, level3Score);
      overallPassed = overallPassed && allPassed;
    }

    const uniqueSuspiciousShards: string[] = [];
    const seen = new Set<string>();
    for (const shard of suspiciousShards) {
      if (!seen.has(shard)) {
        seen.add(shard);
        uniqueSuspiciousShards.push(shard);
      }
    }

    return {
      taskId,
      verificationLevel,
      overallScore,
      overallPassed,
      levelResults,
      dualComputeResults,
      consistencyIssues,
      physicalLawIssues,
      suspiciousShards: uniqueSuspiciousShards,
      generatedAt: new Date(),
    };
  }

  cacheDualComputeResult(result: DualComputeResult): void {
    this.dualComputeCache.set(result.shardId, result);
  }

  getVerificationLevelForTask(task: Task): VerificationLevel {
    return task.priority >= this.HIGH_PRIORITY_THRESHOLD
      ? VerificationLevel.LEVEL_3
      : this.DEFAULT_VERIFICATION_LEVEL;
  }

  shouldTriggerRecalculation(verificationScore: number): boolean {
    return verificationScore < 60;
  }

  getErrorThresholds(): { warning: number; failure: number } {
    return {
      warning: this.ERROR_THRESHOLD_WARNING,
      failure: this.ERROR_THRESHOLD_FAILURE,
    };
  }
}

export const crossVerificationService = CrossVerificationService.getInstance();
export default CrossVerificationService;
