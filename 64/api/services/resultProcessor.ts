import { v4 as uuidv4 } from 'uuid';
import { CalculationResult, ResultMetadata, WriteStatus, WriteTransaction, Task } from '../../shared/types.js';
import { generateMockCalculationResult, generateMockTasks, generateMockNodes, generateMockTaskShards } from './mockData.js';
import { dataSource } from './dataSource.js';
import {
  crossVerificationService,
  VerificationLevel,
  VerificationResult,
} from './crossVerification.js';

class WriteTransactionManager {
  private transactions: Map<string, WriteTransaction> = new Map();
  private readonly TRANSACTION_TIMEOUT = 5 * 60 * 1000;

  beginTransaction(taskId: string, shardIds: string[]): WriteTransaction {
    const transaction: WriteTransaction = {
      id: uuidv4(),
      taskId,
      shardIds,
      status: 'preparing',
      checksum: '',
      createdAt: new Date(),
    };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  prepareWrite(transactionId: string, result: CalculationResult): void {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    if (transaction.status !== 'preparing') {
      throw new Error(`Transaction ${transactionId} is not in preparing state`);
    }
    result.writeStatus = WriteStatus.WRITING;
    result.writeAttempts = (result.writeAttempts || 0) + 1;
  }

  commitWrite(transactionId: string, resultId: string, checksum: string): void {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    transaction.status = 'committed';
    transaction.checksum = checksum;
    transaction.committedAt = new Date();
  }

  rollbackTransaction(transactionId: string): void {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return;
    }
    transaction.status = 'rolled_back';
    this.transactions.delete(transactionId);
  }

  cleanupFailedWrites(results: CalculationResult[]): string[] {
    const now = Date.now();
    const failedResultIds: string[] = [];

    for (const [id, transaction] of this.transactions) {
      if (transaction.status === 'preparing' &&
          now - transaction.createdAt.getTime() > this.TRANSACTION_TIMEOUT) {
        for (const result of results) {
          if (transaction.shardIds.includes(result.shardId) &&
              result.writeStatus === WriteStatus.WRITING) {
            failedResultIds.push(result.id);
          }
        }
        this.transactions.delete(id);
      }
    }

    return failedResultIds;
  }

  getTransaction(transactionId: string): WriteTransaction | undefined {
    return this.transactions.get(transactionId);
  }
}

export class ResultProcessor {
  private transactionManager: WriteTransactionManager;
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 100;
  private readonly DJB2_INITIAL_HASH = 5381;
  private readonly DJB2_MULTIPLIER = 33;
  private verificationResults: Map<string, { level: VerificationLevel; score: number }> = new Map();

  constructor() {
    this.transactionManager = new WriteTransactionManager();
  }

  private initializeMockData(): void {
    const tasks = generateMockTasks(5);
    const nodes = generateMockNodes(3);
    const shards = generateMockTaskShards(tasks, nodes);

    for (const shard of shards) {
      if (shard.status === 'completed') {
        const task = tasks.find(t => t.id === shard.taskId);
        if (task) {
          const result = generateMockCalculationResult(shard, task);
          result.checksum = this.calculateChecksum(result.settlementData, result.stressData, result.displacementData);
          result.writeStatus = WriteStatus.VERIFIED;
          result.writeAttempts = 1;
          result.verifiedAt = new Date();
          dataSource.addResult(result);
        }
      }
    }
  }

  calculateChecksum(settlementData: number[][], stressData: number[][], displacementData: number[][]): string {
    const hashData = (data: number[][]): number => {
      let hash = this.DJB2_INITIAL_HASH;
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        for (let j = 0; j < row.length; j++) {
          const val = row[j];
          hash = ((hash * this.DJB2_MULTIPLIER) ^ i) >>> 0;
          hash = ((hash * this.DJB2_MULTIPLIER) ^ j) >>> 0;
          const buffer = new ArrayBuffer(8);
          new Float64Array(buffer)[0] = val;
          const ints = new Uint32Array(buffer);
          hash = ((hash * this.DJB2_MULTIPLIER) ^ ints[0]) >>> 0;
          hash = ((hash * this.DJB2_MULTIPLIER) ^ ints[1]) >>> 0;
        }
      }
      return hash >>> 0;
    };

    const settlementHash = hashData(settlementData);
    const stressHash = hashData(stressData);
    const displacementHash = hashData(displacementData);

    const combined = (BigInt(settlementHash) << 64n) |
                     (BigInt(stressHash) << 32n) |
                     BigInt(displacementHash);

    return combined.toString(16).padStart(32, '0');
  }

  verifyChecksum(result: CalculationResult): boolean {
    if (!result.checksum) {
      return false;
    }
    const computedChecksum = this.calculateChecksum(
      result.settlementData,
      result.stressData,
      result.displacementData
    );
    return computedChecksum === result.checksum;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async atomicWriteResult(result: CalculationResult): Promise<CalculationResult> {
    const transaction = this.transactionManager.beginTransaction(result.taskId, [result.shardId]);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        this.transactionManager.prepareWrite(transaction.id, result);

        const checksum = this.calculateChecksum(
          result.settlementData,
          result.stressData,
          result.displacementData
        );
        result.checksum = checksum;

        const preWriteVerify = this.verifyChecksum(result);
        if (!preWriteVerify) {
          throw new Error('Pre-write checksum verification failed');
        }

        const existingIndex = dataSource.getResults().findIndex(r => r.id === result.id);
        if (existingIndex >= 0) {
          dataSource.updateResult(result.id, { ...result });
        } else {
          dataSource.addResult({ ...result });
        }

        const postWriteVerify = this.verifyChecksum(result);
        if (!postWriteVerify) {
          throw new Error('Post-write checksum verification failed');
        }

        result.writeStatus = WriteStatus.VERIFIED;
        result.verifiedAt = new Date();
        this.transactionManager.commitWrite(transaction.id, result.id, checksum);

        const storedResult = dataSource.getResults().find(r => r.id === result.id);
        if (!storedResult || !this.verifyChecksum(storedResult)) {
          throw new Error('Final verification failed');
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Write attempt ${attempt} failed: ${(error as Error).message}`);

        if (attempt < this.MAX_RETRIES) {
          const delayMs = this.BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await this.delay(delayMs);
        }
      }
    }

    this.transactionManager.rollbackTransaction(transaction.id);
    const resultIndex = dataSource.getResults().findIndex(r => r.id === result.id);
    if (resultIndex >= 0) {
      dataSource.removeResult(result.id);
    }

    throw new Error(`Atomic write failed after ${this.MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  async validateResult(result: CalculationResult): Promise<boolean> {
    if (!result.settlementData || !Array.isArray(result.settlementData)) {
      return false;
    }
    if (!result.stressData || !Array.isArray(result.stressData)) {
      return false;
    }
    if (!result.displacementData || !Array.isArray(result.displacementData)) {
      return false;
    }

    const rows = result.settlementData.length;
    if (rows === 0) return false;

    const cols = result.settlementData[0].length;
    if (result.stressData.length !== rows || result.displacementData.length !== rows) {
      return false;
    }

    const isNumberArray = (arr: any[][]): boolean => {
      return arr.every(row =>
        Array.isArray(row) &&
        row.length === cols &&
        row.every(val => typeof val === 'number' && !isNaN(val) && isFinite(val))
      );
    };

    if (!isNumberArray(result.settlementData) ||
        !isNumberArray(result.stressData) ||
        !isNumberArray(result.displacementData)) {
      return false;
    }

    const maxValue = 1e6;
    const minValue = -1e6;
    const isInRange = (arr: number[][]): boolean => {
      return arr.every(row => row.every(val => val >= minValue && val <= maxValue));
    };

    if (!isInRange(result.settlementData) ||
        !isInRange(result.stressData) ||
        !isInRange(result.displacementData)) {
      return false;
    }

    if (!result.metadata ||
        typeof result.metadata.computeTime !== 'number' ||
        typeof result.metadata.maxSettlement !== 'number' ||
        typeof result.metadata.maxStress !== 'number' ||
        typeof result.metadata.convergence !== 'boolean') {
      return false;
    }

    return true;
  }

  async processShardResult(
    taskId: string,
    shardId: string,
    nodeId: string,
    resultData: any
  ): Promise<CalculationResult> {
    const settlementData = resultData.settlementData || resultData.settlement;
    const stressData = resultData.stressData || resultData.stress;
    const displacementData = resultData.displacementData || resultData.displacement;

    const calculateStats = (data: number[][]): { max: number; min: number; avg: number } => {
      let max = -Infinity;
      let min = Infinity;
      let sum = 0;
      let count = 0;

      for (const row of data) {
        for (const val of row) {
          max = Math.max(max, val);
          min = Math.min(min, val);
          sum += val;
          count++;
        }
      }

      return { max, min, avg: count > 0 ? sum / count : 0 };
    };

    const settlementStats = calculateStats(settlementData);
    const stressStats = calculateStats(stressData);

    const checkConvergence = (data: number[][]): boolean => {
      if (data.length < 2) return true;
      const lastRow = data[data.length - 1];
      const prevRow = data[data.length - 2];
      const tolerance = 1e-6;

      for (let i = 0; i < lastRow.length; i++) {
        if (Math.abs(lastRow[i] - prevRow[i]) > tolerance) {
          return false;
        }
      }
      return true;
    };

    const metadata: ResultMetadata = {
      computeTime: resultData.metadata?.computeTime || Math.random() * 60 + 10,
      maxSettlement: settlementStats.max,
      maxStress: stressStats.max,
      convergence: resultData.metadata?.convergence || checkConvergence(settlementData),
    };

    const result: CalculationResult = {
      id: uuidv4(),
      taskId,
      shardId,
      nodeId,
      settlementData,
      stressData,
      displacementData,
      metadata,
      createdAt: new Date(),
      writeStatus: WriteStatus.PENDING,
      writeAttempts: 0,
    };

    const isValid = await this.validateResult(result);
    if (!isValid) {
      throw new Error('Invalid calculation result data');
    }

    return this.saveResult(result);
  }

  async mergeResults(taskId: string): Promise<CalculationResult[]> {
    const taskResults = dataSource.getResults().filter(r => r.taskId === taskId);

    taskResults.sort((a, b) => {
      const shardA = parseInt(a.shardId.split('-').pop() || '0');
      const shardB = parseInt(b.shardId.split('-').pop() || '0');
      return shardA - shardB;
    });

    return taskResults;
  }

  async saveResult(result: CalculationResult): Promise<CalculationResult> {
    const existing = dataSource.getResults().find(r => r.shardId === result.shardId);
    if (existing && existing.writeStatus === WriteStatus.VERIFIED) {
      console.log(`Result for shard ${result.shardId} already exists, skipping write`);
      return existing;
    }

    if (existing) {
      result.id = existing.id;
    }

    const preValidation = await this.validateResult(result);
    if (!preValidation) {
      throw new Error('Result validation failed before write');
    }

    const writtenResult = await this.atomicWriteResult(result);

    const postValidation = await this.validateResult(writtenResult);
    if (!postValidation) {
      const resultIndex = dataSource.getResults().findIndex(r => r.id === writtenResult.id);
      if (resultIndex >= 0) {
        dataSource.removeResult(writtenResult.id);
      }
      throw new Error('Result validation failed after write');
    }

    const verificationInfo = await this.performCrossVerification(writtenResult);
    const enhancedResult = {
      ...writtenResult,
      verificationLevel: verificationInfo.level,
      verificationScore: verificationInfo.score,
    } as CalculationResult & { verificationLevel: VerificationLevel; verificationScore: number };

    dataSource.updateResult(writtenResult.id, {
      verificationLevel: verificationInfo.level,
      verificationScore: verificationInfo.score,
    } as Partial<CalculationResult>);

    if (crossVerificationService.shouldTriggerRecalculation(verificationInfo.score)) {
      console.warn(`Verification failed for shard ${writtenResult.shardId}, triggering recalculation`);
      await this.triggerRecalculation(writtenResult.shardId);
    }

    return enhancedResult;
  }

  private async performCrossVerification(result: CalculationResult): Promise<{ level: VerificationLevel; score: number }> {
    const task = dataSource.getTaskById(result.taskId);
    if (!task) {
      return { level: VerificationLevel.LEVEL_0, score: 100 };
    }

    const verificationLevel = crossVerificationService.getVerificationLevelForTask(task);
    let finalScore = 100;

    const physicalVerification = crossVerificationService.verifyPhysicalLaws(result);
    finalScore = Math.min(finalScore, physicalVerification.score);

    if (verificationLevel >= VerificationLevel.LEVEL_2) {
      const shards = dataSource.getShardsByTaskId(result.taskId);
      const completedShards = shards.filter(s => s.status === 'completed');
      if (completedShards.length >= 2) {
        const consistencyVerification = crossVerificationService.verifyShardConsistency(result.taskId);
        finalScore = Math.min(finalScore, consistencyVerification.score);
      }
    }

    this.verificationResults.set(result.shardId, {
      level: verificationLevel,
      score: finalScore,
    });

    return { level: verificationLevel, score: finalScore };
  }

  private async triggerRecalculation(shardId: string): Promise<void> {
    const shard = dataSource.getShardById(shardId);
    if (!shard) return;

    const newRetryCount = (shard.retryCount || 0) + 1;
    if (newRetryCount > this.MAX_RETRIES) {
      console.error(`Shard ${shardId} exceeded max retries after verification failure`);
      return;
    }

    dataSource.updateTaskShard(shardId, {
      status: 'pending' as any,
      retryCount: newRetryCount,
      progress: 0,
      startedAt: null,
      nodeId: undefined,
      errorMessage: 'Recalculating due to verification failure',
    });

    console.log(`Shard ${shardId} queued for recalculation (attempt ${newRetryCount})`);
  }

  async getVerificationResult(shardId: string): Promise<{ level: VerificationLevel; score: number } | undefined> {
    return this.verificationResults.get(shardId);
  }

  async batchSaveResults(results: CalculationResult[]): Promise<{ success: string[]; failed: string[] }> {
    if (results.length === 0) {
      return { success: [], failed: [] };
    }

    const taskId = results[0].taskId;
    const shardIds = results.map(r => r.shardId);
    const transaction = this.transactionManager.beginTransaction(taskId, shardIds);

    const preparedResults: CalculationResult[] = [];
    const failedResultIds: string[] = [];
    const successResultIds: string[] = [];

    try {
      for (const result of results) {
        const existing = dataSource.getResults().find(r => r.shardId === result.shardId);
        if (existing && existing.writeStatus === WriteStatus.VERIFIED) {
          successResultIds.push(existing.id);
          continue;
        }

        const isValid = await this.validateResult(result);
        if (!isValid) {
          failedResultIds.push(result.id);
          continue;
        }

        result.writeStatus = WriteStatus.WRITING;
        result.writeAttempts = (result.writeAttempts || 0) + 1;
        result.checksum = this.calculateChecksum(
          result.settlementData,
          result.stressData,
          result.displacementData
        );

        if (!this.verifyChecksum(result)) {
          failedResultIds.push(result.id);
          continue;
        }

        preparedResults.push({ ...result });
      }

      if (failedResultIds.length > 0) {
        throw new Error(`Validation failed for ${failedResultIds.length} results`);
      }

      for (const result of preparedResults) {
        const existingIndex = dataSource.getResults().findIndex(r => r.shardId === result.shardId);
        if (existingIndex >= 0) {
          dataSource.updateResult(result.id, { ...result });
        } else {
          dataSource.addResult({ ...result });
        }
      }

      for (const result of preparedResults) {
        const stored = dataSource.getResults().find(r => r.id === result.id);
        if (!stored || !this.verifyChecksum(stored)) {
          throw new Error(`Post-write verification failed for result ${result.id}`);
        }
      }

      const combinedChecksum = this.calculateChecksum(
        preparedResults.flatMap(r => r.settlementData),
        preparedResults.flatMap(r => r.stressData),
        preparedResults.flatMap(r => r.displacementData)
      );

      for (const result of preparedResults) {
        dataSource.updateResult(result.id, {
          writeStatus: WriteStatus.VERIFIED,
          verifiedAt: new Date(),
        });
        successResultIds.push(result.id);
      }

      this.transactionManager.commitWrite(
        transaction.id,
        successResultIds.join(','),
        combinedChecksum
      );

      return { success: successResultIds, failed: failedResultIds };
    } catch (error) {
      console.error(`Batch save failed: ${(error as Error).message}`);

      this.transactionManager.rollbackTransaction(transaction.id);

      for (const result of preparedResults) {
        const index = dataSource.getResults().findIndex(r => r.id === result.id);
        if (index >= 0) {
          dataSource.removeResult(result.id);
        }
      }

      return { success: [], failed: [...failedResultIds, ...preparedResults.map(r => r.id)] };
    }
  }

  async verifyAndRepairResults(): Promise<{
    total: number;
    verified: number;
    corrupted: number;
    repaired: number;
    corruptedDetails: Array<{ resultId: string; shardId: string; taskId: string; error: string }>;
  }> {
    const corruptedDetails: Array<{ resultId: string; shardId: string; taskId: string; error: string }> = [];
    let verified = 0;
    let repaired = 0;

    const failedIds = this.transactionManager.cleanupFailedWrites(dataSource.getResults());
    for (const id of failedIds) {
      const results = dataSource.getResults();
      const index = results.findIndex(r => r.id === id);
      if (index >= 0) {
        const result = results[index];
        corruptedDetails.push({
          resultId: result.id,
          shardId: result.shardId,
          taskId: result.taskId,
          error: 'Orphaned write transaction, marked for recalculation',
        });
        dataSource.updateResult(id, { writeStatus: WriteStatus.FAILED });
      }
    }

    for (const result of dataSource.getResults()) {
      try {
        if (!result.checksum) {
          const checksum = this.calculateChecksum(
            result.settlementData,
            result.stressData,
            result.displacementData
          );
          dataSource.updateResult(result.id, {
            checksum,
            writeStatus: WriteStatus.VERIFIED,
            verifiedAt: new Date(),
          });
          repaired++;
          verified++;
          continue;
        }

        const isValid = this.verifyChecksum(result);
        if (!isValid) {
          corruptedDetails.push({
            resultId: result.id,
            shardId: result.shardId,
            taskId: result.taskId,
            error: 'Checksum mismatch, data corrupted',
          });
          dataSource.updateResult(result.id, { writeStatus: WriteStatus.FAILED });
          continue;
        }

        if (result.writeStatus !== WriteStatus.VERIFIED) {
          dataSource.updateResult(result.id, {
            writeStatus: WriteStatus.VERIFIED,
            verifiedAt: new Date(),
          });
          repaired++;
        }

        verified++;
      } catch (error) {
        corruptedDetails.push({
          resultId: result.id,
          shardId: result.shardId,
          taskId: result.taskId,
          error: `Verification error: ${(error as Error).message}`,
        });
        dataSource.updateResult(result.id, { writeStatus: WriteStatus.FAILED });
      }
    }

    return {
      total: dataSource.getResults().length,
      verified,
      corrupted: corruptedDetails.length,
      repaired,
      corruptedDetails,
    };
  }

  async getResultList(
    filters?: { taskId?: string; startDate?: Date; endDate?: Date },
    page: number = 1,
    pageSize: number = 10
  ): Promise<{ total: number; items: CalculationResult[] }> {
    let results = [...dataSource.getResults()];

    if (filters?.taskId) {
      results = results.filter(r => r.taskId === filters.taskId);
    }
    if (filters?.startDate) {
      results = results.filter(r => new Date(r.createdAt) >= filters.startDate!);
    }
    if (filters?.endDate) {
      results = results.filter(r => new Date(r.createdAt) <= filters.endDate!);
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const start = (page - 1) * pageSize;
    const items = results.slice(start, start + pageSize);

    return {
      total: results.length,
      items,
    };
  }

  async getResultById(resultId: string): Promise<CalculationResult | null> {
    return dataSource.getResults().find(r => r.id === resultId) || null;
  }

  async getResultsByTaskId(taskId: string): Promise<CalculationResult[]> {
    return dataSource.getResults().filter(r => r.taskId === taskId);
  }

  async exportResults(resultIds: string[], format: 'json' | 'csv'): Promise<Buffer> {
    const results = dataSource.getResults().filter(r => resultIds.includes(r.id));

    if (format === 'json') {
      const exportData = results.map(r => ({
        id: r.id,
        taskId: r.taskId,
        shardId: r.shardId,
        nodeId: r.nodeId,
        createdAt: r.createdAt,
        metadata: r.metadata,
        checksum: r.checksum,
        writeStatus: r.writeStatus,
        verifiedAt: r.verifiedAt,
        settlementStats: {
          max: Math.max(...r.settlementData.flat()),
          min: Math.min(...r.settlementData.flat()),
          avg: r.settlementData.flat().reduce((a, b) => a + b, 0) / r.settlementData.flat().length,
        },
        stressStats: {
          max: Math.max(...r.stressData.flat()),
          min: Math.min(...r.stressData.flat()),
          avg: r.stressData.flat().reduce((a, b) => a + b, 0) / r.stressData.flat().length,
        },
      }));

      return Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
    } else {
      const headers = ['id', 'taskId', 'nodeId', 'createdAt', 'maxSettlement', 'maxStress', 'convergence', 'computeTime', 'writeStatus', 'checksum'];
      const rows = results.map(r => [
        r.id,
        r.taskId,
        r.nodeId,
        r.createdAt.toISOString(),
        r.metadata.maxSettlement.toFixed(6),
        r.metadata.maxStress.toFixed(2),
        r.metadata.convergence ? 'YES' : 'NO',
        r.metadata.computeTime.toFixed(2),
        r.writeStatus || 'unknown',
        r.checksum || '',
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      return Buffer.from(csvContent, 'utf-8');
    }
  }

  async generateResultReport(taskId: string): Promise<any> {
    const results = await this.getResultsByTaskId(taskId);

    if (results.length === 0) {
      return { taskId, message: 'No results found for this task' };
    }

    const allSettlement = results.flatMap(r => r.settlementData.flat());
    const allStress = results.flatMap(r => r.stressData.flat());
    const allDisplacement = results.flatMap(r => r.displacementData.flat());

    const verifiedResults = results.filter(r => r.writeStatus === WriteStatus.VERIFIED);
    const failedResults = results.filter(r => r.writeStatus === WriteStatus.FAILED);

    const report = {
      taskId,
      totalShards: results.length,
      verifiedShards: verifiedResults.length,
      failedShards: failedResults.length,
      generatedAt: new Date(),
      integrityStatus: {
        allVerified: verifiedResults.length === results.length,
        corruptedCount: failedResults.length,
        lastVerifiedAt: verifiedResults.length > 0
          ? new Date(Math.max(...verifiedResults.map(r => r.verifiedAt?.getTime() || 0)))
          : null,
      },
      timeStatistics: {
        totalComputeTime: results.reduce((sum, r) => sum + r.metadata.computeTime, 0),
        avgComputeTime: results.reduce((sum, r) => sum + r.metadata.computeTime, 0) / results.length,
        minComputeTime: Math.min(...results.map(r => r.metadata.computeTime)),
        maxComputeTime: Math.max(...results.map(r => r.metadata.computeTime)),
      },
      settlementStatistics: {
        max: Math.max(...allSettlement),
        min: Math.min(...allSettlement),
        avg: allSettlement.reduce((a, b) => a + b, 0) / allSettlement.length,
        unit: 'meters',
      },
      stressStatistics: {
        max: Math.max(...allStress),
        min: Math.min(...allStress),
        avg: allStress.reduce((a, b) => a + b, 0) / allStress.length,
        unit: 'kPa',
      },
      displacementStatistics: {
        max: Math.max(...allDisplacement),
        min: Math.min(...allDisplacement),
        avg: allDisplacement.reduce((a, b) => a + b, 0) / allDisplacement.length,
        unit: 'meters',
      },
      convergenceAnalysis: {
        totalShards: results.length,
        convergedShards: results.filter(r => r.metadata.convergence).length,
        convergenceRate: results.filter(r => r.metadata.convergence).length / results.length,
      },
      nodeContribution: results.reduce((acc, r) => {
        if (!acc[r.nodeId]) {
          acc[r.nodeId] = { shards: 0, totalTime: 0 };
        }
        acc[r.nodeId].shards++;
        acc[r.nodeId].totalTime += r.metadata.computeTime;
        return acc;
      }, {} as Record<string, { shards: number; totalTime: number }>),
      shardResults: results.map(r => ({
        shardId: r.shardId,
        nodeId: r.nodeId,
        maxSettlement: r.metadata.maxSettlement,
        maxStress: r.metadata.maxStress,
        computeTime: r.metadata.computeTime,
        converged: r.metadata.convergence,
        writeStatus: r.writeStatus,
        checksum: r.checksum,
      })),
    };

    return report;
  }

  async cleanupOldResults(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const initialCount = dataSource.getResults().length;
    const resultsToDelete = dataSource.getResults().filter(r => new Date(r.createdAt) < cutoffDate);
    for (const result of resultsToDelete) {
      dataSource.removeResult(result.id);
    }
    const deletedCount = initialCount - dataSource.getResults().length;

    console.log(`Cleaned up ${deletedCount} old results`);
    return deletedCount;
  }
}

export const resultProcessor = new ResultProcessor();
