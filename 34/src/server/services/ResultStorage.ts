import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { createObjectCsvWriter } from 'csv-writer';
import { v4 as uuidv4 } from 'uuid';
import TaskResult from '../models/TaskResult';
import { TaskResult as ITaskResult } from '../types';
import logger from '../utils/logger';
import config from '../config';

export interface StoredResult {
  id: string;
  taskId: string;
  chunkId: string;
  nodeId: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  variables: string[];
  timesteps: number[];
  checksum?: string;
  dataIntegrityVerified?: boolean;
  downloadUrl?: string;
  previewData?: any;
}

class ResultStorage {
  private static instance: ResultStorage;
  private basePath: string;
  private resultsPath: string;
  private tempPath: string;
  private readonly SHARD_SIZE_THRESHOLD = 50 * 1024 * 1024;
  private readonly TIMESTEP_SHARD_SIZE = 100;

  private constructor() {
    this.basePath = config.storage.basePath;
    this.resultsPath = path.join(this.basePath, config.storage.taskResultsPath);
    this.tempPath = path.join(this.basePath, config.storage.tempPath);
    this.initializeDirectories();
  }

  static getInstance(): ResultStorage {
    if (!ResultStorage.instance) {
      ResultStorage.instance = new ResultStorage();
    }
    return ResultStorage.instance;
  }

  private async initializeDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.resultsPath, { recursive: true });
      await fs.mkdir(this.tempPath, { recursive: true });
    } catch (error) {
      logger.error(`Failed to initialize storage directories: ${(error as Error).message}`);
    }
  }

  async storeResult(
    taskId: string,
    chunkId: string,
    nodeId: string,
    sourcePath: string,
    variables: string[],
    timesteps: number[],
    metadata?: Record<string, any>
  ): Promise<StoredResult> {
    const resultId = `result_${uuidv4()}`;
    const relativePath = `${taskId}/${chunkId}`;
    const targetPath = path.join(this.resultsPath, relativePath);
    const tempPath = path.join(this.tempPath, `${resultId}_${Date.now()}`);

    try {
      await this.validateSourceData(sourcePath, variables, timesteps);

      await fs.mkdir(tempPath, { recursive: true });
      await this.copyDirectory(sourcePath, tempPath);

      const integrityCheck = await this.verifyDataIntegrity(tempPath, variables, timesteps);
      if (!integrityCheck.valid) {
        throw new Error(`Data integrity check failed: ${integrityCheck.error}`);
      }

      await fs.mkdir(targetPath, { recursive: true });
      await this.copyDirectory(tempPath, targetPath);

      const fileSize = await this.getDirectorySize(targetPath);
      const checksum = await this.calculateChecksum(targetPath);

      const previewData = await this.generatePreviewData(targetPath, variables, timesteps);

      const existingResult = await TaskResult.findOne({ taskId, chunkId });
      if (existingResult) {
        logger.warn(`Overwriting existing result for task ${taskId}, chunk ${chunkId}`);
        await TaskResult.deleteOne({ id: existingResult.id });
      }

      const result = new TaskResult({
        id: resultId,
        taskId,
        chunkId,
        nodeId,
        filePath: relativePath,
        fileSize,
        fileType: 'openfoam',
        variables,
        timesteps,
        checksum,
        dataIntegrityVerified: true,
        metadata: {
          ...metadata,
          previewData: Object.keys(previewData).length > 0 ? previewData : undefined,
          integrityCheck,
          storedAt: new Date().toISOString(),
        },
      });

      await result.save();

      await this.cleanupTempData(tempPath);

      logger.info(`Stored result ${resultId} for task ${taskId}, chunk ${chunkId}, size: ${fileSize} bytes`);

      return {
        id: resultId,
        taskId,
        chunkId,
        nodeId,
        filePath: relativePath,
        fileSize,
        fileType: 'openfoam',
        variables,
        timesteps,
        previewData,
      };
    } catch (error) {
      await this.cleanupTempData(tempPath);
      await this.cleanupPartialData(targetPath);
      logger.error(`Failed to store result for chunk ${chunkId}: ${(error as Error).message}`);
      throw error;
    }
  }

  private async validateSourceData(
    sourcePath: string,
    variables: string[],
    timesteps: number[]
  ): Promise<void> {
    try {
      await fs.access(sourcePath);
    } catch {
      throw new Error(`Source path does not exist: ${sourcePath}`);
    }

    if (variables.length === 0) {
      throw new Error('No variables provided');
    }

    if (timesteps.length === 0) {
      throw new Error('No timesteps provided');
    }

    const latestTimestep = Math.max(...timesteps);
    const timestepPath = path.join(sourcePath, latestTimestep.toString());

    try {
      await fs.access(timestepPath);
    } catch {
      throw new Error(`Latest timestep directory missing: ${latestTimestep}`);
    }

    for (const variable of variables) {
      const varPath = path.join(timestepPath, variable);
      try {
        const stats = await fs.stat(varPath);
        if (stats.size === 0) {
          throw new Error(`Variable file is empty: ${variable}`);
        }
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          throw new Error(`Variable file missing: ${variable}`);
        }
        throw error;
      }
    }
  }

  private async verifyDataIntegrity(
    dataPath: string,
    variables: string[],
    timesteps: number[]
  ): Promise<{ valid: boolean; error?: string; details?: Record<string, any> }> {
    const details: Record<string, any> = {
      fileCount: 0,
      totalSize: 0,
      variableChecks: {} as Record<string, any>,
    };

    for (const timestep of timesteps) {
      const timestepPath = path.join(dataPath, timestep.toString());
      try {
        await fs.access(timestepPath);
      } catch {
        return { valid: false, error: `Timestep directory missing: ${timestep}` };
      }

      for (const variable of variables) {
        const varPath = path.join(timestepPath, variable);
        try {
          const stats = await fs.stat(varPath);
          if (stats.size === 0) {
            return { valid: false, error: `Variable file empty at timestep ${timestep}: ${variable}` };
          }
          
          if (!details.variableChecks[variable]) {
            details.variableChecks[variable] = { timesteps: [], sizes: [] };
          }
          details.variableChecks[variable].timesteps.push(timestep);
          details.variableChecks[variable].sizes.push(stats.size);
          details.fileCount++;
          details.totalSize += stats.size;
        } catch (error) {
          return { valid: false, error: `Variable missing at timestep ${timestep}: ${variable}` };
        }
      }
    }

    const systemPath = path.join(dataPath, 'system');
    try {
      await fs.access(systemPath);
    } catch {
      return { valid: false, error: 'System directory missing' };
    }

    const constantPath = path.join(dataPath, 'constant');
    try {
      await fs.access(constantPath);
    } catch {
      return { valid: false, error: 'Constant directory missing' };
    }

    return { valid: true, details };
  }

  private async calculateChecksum(dataPath: string): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');

    const files = await this.getAllFiles(dataPath);
    for (const file of files.sort()) {
      const content = await fs.readFile(file);
      hash.update(content);
    }

    return hash.digest('hex');
  }

  private async getAllFiles(dirPath: string, files: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this.getAllFiles(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private async cleanupTempData(tempPath: string): Promise<void> {
    try {
      await fs.rm(tempPath, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to cleanup temp data: ${(error as Error).message}`);
    }
  }

  private async cleanupPartialData(targetPath: string): Promise<void> {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to cleanup partial data: ${(error as Error).message}`);
    }
  }

  private async copyDirectory(source: string, destination: string): Promise<void> {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async getDirectorySize(directoryPath: string): Promise<number> {
    let totalSize = 0;

    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await this.getDirectorySize(entryPath);
      } else {
        const stats = await fs.stat(entryPath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  private async generatePreviewData(
    resultPath: string,
    variables: string[],
    timesteps: number[]
  ): Promise<Record<string, any>> {
    const preview: Record<string, any> = {};

    if (timesteps.length === 0) return preview;

    const latestTimestep = Math.max(...timesteps);
    const timestepPath = path.join(resultPath, latestTimestep.toString());

    try {
      await fs.access(timestepPath);

      for (const variable of variables) {
        const filePath = path.join(timestepPath, variable);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          preview[variable] = this.extractPreviewData(content, variable);
        } catch {
          continue;
        }
      }
    } catch {
      preview.timesteps = timesteps;
    }

    return preview;
  }

  private extractPreviewData(content: string, variable: string): any {
    const data: any = {};

    const dimMatch = content.match(/dimensions\s+([^;]+);/);
    if (dimMatch) {
      data.dimensions = dimMatch[1].trim();
    }

    const internalMatch = content.match(/internalField\s+(\w+)\s+([^;]+);/);
    if (internalMatch) {
      data.internalFieldType = internalMatch[1];
      data.internalFieldValue = internalMatch[2].trim();
    }

    const boundaryMatch = content.match(/boundaryField\s*{([^}]+)}/s);
    if (boundaryMatch) {
      const boundaries = boundaryMatch[1];
      const boundaryNames = boundaries.match(/(\w+)\s*{/g);
      if (boundaryNames) {
        data.boundaries = boundaryNames.map((b) => b.replace('{', '').trim());
      }
    }

    return data;
  }

  async getResult(resultId: string): Promise<StoredResult | null> {
    const result = await TaskResult.findOne({ id: resultId });
    if (!result) return null;

    return {
      id: result.id,
      taskId: result.taskId,
      chunkId: result.chunkId,
      nodeId: result.nodeId,
      filePath: result.filePath,
      fileSize: result.fileSize,
      fileType: result.fileType,
      variables: result.variables,
      timesteps: result.timesteps,
      previewData: result.metadata?.previewData,
    };
  }

  async getTaskResults(taskId: string): Promise<StoredResult[]> {
    const results = await TaskResult.find({ taskId }).sort({ createdAt: 1 });

    return results.map((result) => ({
      id: result.id,
      taskId: result.taskId,
      chunkId: result.chunkId,
      nodeId: result.nodeId,
      filePath: result.filePath,
      fileSize: result.fileSize,
      fileType: result.fileType,
      variables: result.variables,
      timesteps: result.timesteps,
      previewData: result.metadata?.previewData,
    }));
  }

  async createResultArchive(taskId: string): Promise<string> {
    const results = await this.getTaskResults(taskId);
    if (results.length === 0) {
      throw new Error('No results found for task');
    }

    const archivePath = path.join(this.tempPath, `${taskId}.zip`);
    const output = require('fs').createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    for (const result of results) {
      const resultPath = path.join(this.resultsPath, result.filePath);
      archive.directory(resultPath, result.chunkId);
    }

    await archive.finalize();

    return archivePath;
  }

  async exportToCSV(taskId: string, outputPath?: string): Promise<string> {
    const results = await this.getTaskResults(taskId);
    if (results.length === 0) {
      throw new Error('No results found for task');
    }

    const csvPath = outputPath || path.join(this.tempPath, `${taskId}_summary.csv`);

    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'resultId', title: 'Result ID' },
        { id: 'chunkId', title: 'Chunk ID' },
        { id: 'nodeId', title: 'Node ID' },
        { id: 'fileSize', title: 'File Size (bytes)' },
        { id: 'variables', title: 'Variables' },
        { id: 'timesteps', title: 'Timesteps' },
      ],
    });

    const records = results.map((r) => ({
      resultId: r.id,
      chunkId: r.chunkId,
      nodeId: r.nodeId,
      fileSize: r.fileSize,
      variables: r.variables.join(', '),
      timesteps: r.timesteps.length,
    }));

    await csvWriter.writeRecords(records);

    return csvPath;
  }

  async mergeTaskResults(taskId: string): Promise<string> {
    const results = await this.getTaskResults(taskId);
    if (results.length === 0) {
      throw new Error('No results found for task');
    }

    const mergedPath = path.join(this.resultsPath, taskId, 'merged');
    await fs.mkdir(mergedPath, { recursive: true });

    const allVariables = new Set<string>();
    const allTimesteps = new Set<number>();

    for (const result of results) {
      result.variables.forEach((v) => allVariables.add(v));
      result.timesteps.forEach((t) => allTimesteps.add(t));
    }

    const summary = {
      taskId,
      resultCount: results.length,
      variables: Array.from(allVariables),
      timesteps: Array.from(allTimesteps).sort((a, b) => a - b),
      totalFileSize: results.reduce((sum, r) => sum + r.fileSize, 0),
      chunks: results.map((r) => ({
        chunkId: r.chunkId,
        nodeId: r.nodeId,
        variables: r.variables,
        timesteps: r.timesteps,
      })),
    };

    await fs.writeFile(path.join(mergedPath, 'summary.json'), JSON.stringify(summary, null, 2));

    return mergedPath;
  }

  async deleteResult(resultId: string): Promise<void> {
    const result = await TaskResult.findOne({ id: resultId });
    if (!result) return;

    const fullPath = path.join(this.resultsPath, result.filePath);
    try {
      await fs.rm(fullPath, { recursive: true, force: true });
    } catch (error) {
      logger.error(`Failed to delete result files: ${(error as Error).message}`);
    }

    await TaskResult.findOneAndDelete({ id: resultId });
    logger.info(`Deleted result ${resultId}`);
  }

  async deleteTaskResults(taskId: string): Promise<void> {
    const results = await TaskResult.find({ taskId });

    for (const result of results) {
      const fullPath = path.join(this.resultsPath, result.filePath);
      try {
        await fs.rm(fullPath, { recursive: true, force: true });
      } catch (error) {
        logger.error(`Failed to delete result files: ${(error as Error).message}`);
      }
    }

    await TaskResult.deleteMany({ taskId });
    logger.info(`Deleted all results for task ${taskId}`);
  }

  getResultPath(resultId: string): Promise<string | null>;
  getResultPath(taskId: string, chunkId: string): Promise<string | null>;
  async getResultPath(...args: string[]): Promise<string | null> {
    let result;

    if (args.length === 1) {
      result = await TaskResult.findOne({ id: args[0] });
    } else {
      result = await TaskResult.findOne({ taskId: args[0], chunkId: args[1] });
    }

    if (!result) return null;
    return path.join(this.resultsPath, result.filePath);
  }

  async getStorageStats(): Promise<{
    totalSize: number;
    resultCount: number;
    taskCount: number;
  }> {
    const [resultCount, results] = await Promise.all([
      TaskResult.countDocuments(),
      TaskResult.find({}, 'taskId fileSize'),
    ]);

    const taskIds = new Set(results.map((r) => r.taskId));
    const totalSize = results.reduce((sum, r) => sum + r.fileSize, 0);

    return {
      totalSize,
      resultCount,
      taskCount: taskIds.size,
    };
  }

  async cleanupOldResults(maxAgeDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    const oldResults = await TaskResult.find({ createdAt: { $lt: cutoffDate } });

    for (const result of oldResults) {
      await this.deleteResult(result.id);
    }

    logger.info(`Cleaned up ${oldResults.length} old results`);
    return oldResults.length;
  }

  async verifyResultIntegrity(resultId: string): Promise<{
    valid: boolean;
    error?: string;
    details?: Record<string, any>;
  }> {
    const result = await TaskResult.findOne({ id: resultId });
    if (!result) {
      return { valid: false, error: 'Result not found' };
    }

    const fullPath = path.join(this.resultsPath, result.filePath);
    
    try {
      await fs.access(fullPath);
    } catch {
      return { valid: false, error: 'Result files missing' };
    }

    const currentChecksum = await this.calculateChecksum(fullPath);
    const checksumMatch = currentChecksum === result.checksum;

    const fileSize = await this.getDirectorySize(fullPath);
    const sizeMatch = Math.abs(fileSize - result.fileSize) < 1024;

    const details = {
      storedChecksum: result.checksum,
      currentChecksum,
      checksumMatch,
      storedFileSize: result.fileSize,
      currentFileSize: fileSize,
      sizeMatch,
      variablesComplete: result.variables.length > 0,
      timestepsComplete: result.timesteps.length > 0,
    };

    const valid = checksumMatch && sizeMatch && !!result.dataIntegrityVerified;

    return { valid, details };
  }

  async verifyTaskResults(taskId: string): Promise<{
    valid: boolean;
    results: Array<{
      resultId: string;
      chunkId: string;
      valid: boolean;
      error?: string;
    }>;
    missingChunks: string[];
  }> {
    const Task = require('../models/Task').default;
    const task = await Task.findOne({ id: taskId });
    
    if (!task) {
      return { valid: false, results: [], missingChunks: [] };
    }

    const results = await this.getTaskResults(taskId);
    const resultChunkIds = new Set(results.map(r => r.chunkId));
    
    const missingChunks = task.chunks
      .filter((c: any) => c.status === 'completed' && !resultChunkIds.has(c.id))
      .map((c: any) => c.id);

    const verificationResults = [];
    for (const result of results) {
      const verification = await this.verifyResultIntegrity(result.id);
      verificationResults.push({
        resultId: result.id,
        chunkId: result.chunkId,
        valid: verification.valid,
        error: verification.error,
      });
    }

    const allValid = verificationResults.every(r => r.valid) && missingChunks.length === 0;

    return {
      valid: allValid,
      results: verificationResults,
      missingChunks,
    };
  }

  async repairMissingResults(taskId: string): Promise<{
    repaired: string[];
    failed: string[];
  }> {
    const Task = require('../models/Task').default;
    const task = await Task.findOne({ id: taskId });
    
    if (!task) {
      return { repaired: [], failed: [] };
    }

    const results = await this.getTaskResults(taskId);
    const resultChunkIds = new Set(results.map(r => r.chunkId));
    
    const completedChunksWithoutResults = task.chunks.filter(
      (c: any) => c.status === 'completed' && !resultChunkIds.has(c.id)
    );

    const repaired: string[] = [];
    const failed: string[] = [];

    for (const chunk of completedChunksWithoutResults) {
      if (chunk.resultPath) {
        try {
          await fs.access(chunk.resultPath);
          
          await this.storeResult(
            taskId,
            chunk.id,
            chunk.assignedNode || 'unknown',
            chunk.resultPath,
            ['U', 'p'],
            chunk.endTime ? [chunk.endTime.getTime() / 1000] : [],
            { repaired: true, originalChunk: chunk.id }
          );
          
          repaired.push(chunk.id);
          logger.info(`Repaired result for chunk ${chunk.id}`);
        } catch (error) {
          failed.push(chunk.id);
          logger.error(`Failed to repair result for chunk ${chunk.id}: ${(error as Error).message}`);
        }
      } else {
        failed.push(chunk.id);
      }
    }

    return { repaired, failed };
  }

  async storeShardedResult(
    taskId: string,
    chunkId: string,
    nodeId: string,
    sourcePath: string,
    variables: string[],
    timesteps: number[],
    metadata?: Record<string, any>
  ): Promise<{ result: StoredResult; shards: string[] }> {
    const result = await this.storeResult(taskId, chunkId, nodeId, sourcePath, variables, timesteps, metadata);

    const shards: string[] = [];
    const sourceDir = path.join(this.resultsPath, result.filePath);
    const totalSize = await this.getDirectorySize(sourceDir);

    if (totalSize > this.SHARD_SIZE_THRESHOLD) {
      const createdShards = await this.createTimestepShards(taskId, chunkId, sourceDir, timesteps, variables);
      shards.push(...createdShards);
      logger.info(`Created ${createdShards.length} shards for large result: ${result.id}`);
    }

    return { result, shards };
  }

  private async createTimestepShards(
    taskId: string,
    chunkId: string,
    sourceDir: string,
    timesteps: number[],
    variables: string[]
  ): Promise<string[]> {
    const shards: string[] = [];
    const sortedTimesteps = [...timesteps].sort((a, b) => a - b);

    for (let i = 0; i < sortedTimesteps.length; i += this.TIMESTEP_SHARD_SIZE) {
      const shardTimesteps = sortedTimesteps.slice(i, i + this.TIMESTEP_SHARD_SIZE);
      const shardIndex = Math.floor(i / this.TIMESTEP_SHARD_SIZE);
      const shardId = `shard_${taskId}_${chunkId}_${shardIndex}`;

      const shardPath = path.join(sourceDir, '.shards', `shard_${shardIndex}`);
      await fs.mkdir(shardPath, { recursive: true });

      const shardManifest: any = {
        shardId,
        taskId,
        chunkId,
        shardIndex,
        timestepRange: {
          start: shardTimesteps[0],
          end: shardTimesteps[shardTimesteps.length - 1],
          count: shardTimesteps.length,
        },
        variables,
        files: [] as string[],
      };

      for (const timestep of shardTimesteps) {
        const timestepDir = path.join(sourceDir, timestep.toString());
        const targetTimestepDir = path.join(shardPath, timestep.toString());

        try {
          await fs.access(timestepDir);
          await this.copyDirectory(timestepDir, targetTimestepDir);

          for (const variable of variables) {
            const varFile = path.join(targetTimestepDir, variable);
            try {
              const stat = await fs.stat(varFile);
              shardManifest.files.push(`${timestep}/${variable}`);
              shardManifest.totalSize = (shardManifest.totalSize || 0) + stat.size;
            } catch {}
          }
        } catch {}
      }

      await fs.writeFile(
        path.join(shardPath, 'manifest.json'),
        JSON.stringify(shardManifest, null, 2)
      );

      shards.push(shardId);
    }

    const masterManifest = {
      taskId,
      chunkId,
      totalTimesteps: timesteps.length,
      totalShards: shards.length,
      shardSize: this.TIMESTEP_SHARD_SIZE,
      variables,
      shards: shards.map((id, idx) => ({
        id,
        index: idx,
        timestepRange: {
          start: sortedTimesteps[idx * this.TIMESTEP_SHARD_SIZE],
          end: sortedTimesteps[Math.min((idx + 1) * this.TIMESTEP_SHARD_SIZE - 1, sortedTimesteps.length - 1)],
        },
      })),
    };

    const shardBasePath = path.join(sourceDir, '.shards');
    await fs.mkdir(shardBasePath, { recursive: true });
    await fs.writeFile(
      path.join(shardBasePath, 'master.json'),
      JSON.stringify(masterManifest, null, 2)
    );

    return shards;
  }

  async streamVariableData(
    taskId: string,
    chunkId: string,
    variable: string,
    timestepRange?: { start: number; end: number }
  ): Promise<Array<{ timestep: number; data: string }>> {
    const result = await TaskResult.findOne({ taskId, chunkId });
    if (!result) {
      throw new Error(`Result not found for task ${taskId}, chunk ${chunkId}`);
    }

    const resultDir = path.join(this.resultsPath, result.filePath);
    const shardBasePath = path.join(resultDir, '.shards');

    let targetTimesteps = result.timesteps;
    if (timestepRange) {
      targetTimesteps = targetTimesteps.filter(
        t => t >= timestepRange.start && t <= timestepRange.end
      );
    }

    const data: Array<{ timestep: number; data: string }> = [];

    let useShards = false;
    try {
      await fs.access(shardBasePath);
      useShards = true;
    } catch {}

    if (useShards) {
      for (const timestep of targetTimesteps) {
        const shardIndex = Math.floor(
          (result.timesteps.indexOf(timestep) >= 0
            ? result.timesteps.indexOf(timestep)
            : 0) / this.TIMESTEP_SHARD_SIZE
        );
        const shardPath = path.join(shardBasePath, `shard_${shardIndex}`);
        const varPath = path.join(shardPath, timestep.toString(), variable);

        try {
          const content = await fs.readFile(varPath, 'utf-8');
          data.push({ timestep, data: content });
        } catch {}
      }
    } else {
      for (const timestep of targetTimesteps) {
        const varPath = path.join(resultDir, timestep.toString(), variable);
        try {
          const content = await fs.readFile(varPath, 'utf-8');
          data.push({ timestep, data: content });
        } catch {}
      }
    }

    return data;
  }

  async getVariableStatistics(
    taskId: string,
    variable: string
  ): Promise<{
    globalMin: number;
    globalMax: number;
    globalMean: number;
    timestepCount: number;
    perChunk: Array<{
      chunkId: string;
      min: number;
      max: number;
      mean: number;
    }>;
  }> {
    const results = await TaskResult.find({ taskId });
    
    let globalMin = Infinity;
    let globalMax = -Infinity;
    let globalSum = 0;
    let globalCount = 0;
    const perChunk: Array<{ chunkId: string; min: number; max: number; mean: number }> = [];

    for (const result of results) {
      const resultDir = path.join(this.resultsPath, result.filePath);
      const latestTimestep = Math.max(...result.timesteps);
      const varPath = path.join(resultDir, latestTimestep.toString(), variable);

      try {
        const content = await fs.readFile(varPath, 'utf-8');
        const stats = this.extractFieldStatistics(content);

        if (stats.valid) {
          globalMin = Math.min(globalMin, stats.min);
          globalMax = Math.max(globalMax, stats.max);
          globalSum += stats.sum;
          globalCount += stats.count;

          perChunk.push({
            chunkId: result.chunkId,
            min: stats.min,
            max: stats.max,
            mean: stats.mean,
          });
        }
      } catch {}
    }

    return {
      globalMin,
      globalMax,
      globalMean: globalCount > 0 ? globalSum / globalCount : 0,
      timestepCount: results.reduce((sum, r) => sum + r.timesteps.length, 0),
      perChunk,
    };
  }

  private extractFieldStatistics(content: string): {
    valid: boolean;
    min: number;
    max: number;
    mean: number;
    sum: number;
    count: number;
  } {
    const result = { valid: false, min: Infinity, max: -Infinity, mean: 0, sum: 0, count: 0 };

    const scalarMatch = content.match(/internalField\s+nonuniform\s+List<scalar>\s+(\d+)\s*\(([^)]+)\)/);
    if (scalarMatch) {
      const values = scalarMatch[2].trim().split(/\s+/).map(Number);
      const validValues = values.filter(v => isFinite(v) && !isNaN(v));

      if (validValues.length > 0) {
        result.valid = true;
        result.min = Math.min(...validValues);
        result.max = Math.max(...validValues);
        result.sum = validValues.reduce((a, b) => a + b, 0);
        result.count = validValues.length;
        result.mean = result.sum / result.count;
      }
    }

    const uniformMatch = content.match(/internalField\s+uniform\s+([^;]+);/);
    if (uniformMatch && !result.valid) {
      const val = parseFloat(uniformMatch[1]);
      if (isFinite(val)) {
        result.valid = true;
        result.min = val;
        result.max = val;
        result.mean = val;
        result.sum = val;
        result.count = 1;
      }
    }

    return result;
  }

  async getShardInfo(taskId: string, chunkId: string): Promise<{
    isSharded: boolean;
    shardCount: number;
    totalTimesteps: number;
    variables: string[];
    shards?: Array<{
      index: number;
      timestepRange: { start: number; end: number };
    }>;
  } | null> {
    const result = await TaskResult.findOne({ taskId, chunkId });
    if (!result) return null;

    const resultDir = path.join(this.resultsPath, result.filePath);
    const masterPath = path.join(resultDir, '.shards', 'master.json');

    try {
      const masterContent = await fs.readFile(masterPath, 'utf-8');
      const master = JSON.parse(masterContent);

      return {
        isSharded: true,
        shardCount: master.totalShards,
        totalTimesteps: master.totalTimesteps,
        variables: master.variables,
        shards: master.shards.map((s: any) => ({
          index: s.index,
          timestepRange: s.timestepRange,
        })),
      };
    } catch {
      return {
        isSharded: false,
        shardCount: 0,
        totalTimesteps: result.timesteps.length,
        variables: result.variables,
      };
    }
  }
}

export default ResultStorage.getInstance();
