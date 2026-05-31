import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { DesensitizationService, DesensitizeResult } from './desensitization.service';
import { CreateDesensitizeDto, DesensitizeMode } from './dto/desensitize.dto';
import { SensitiveMatch } from './strategies/desensitizer.interface';
import * as crypto from 'crypto';

export interface ChunkProcessInfo {
  chunkIndex: number;
  totalChunks: number;
  charStart: number;
  charEnd: number;
  matchCount: number;
}

export interface DesensitizeProgress {
  fileId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalChars: number;
  processedChars: number;
  totalChunks: number;
  processedChunks: number;
  percent: number;
  currentChunk?: ChunkProcessInfo;
  error?: string;
}

export interface StreamingDesensitizeResult {
  desensitizedText: string;
  matches: SensitiveMatch[];
  statistics: Record<string, number>;
  totalMatchCount: number;
  processingTimeMs: number;
  peakMemoryMB: number;
}

interface DesensitizeJob {
  fileId: string;
  totalChars: number;
  totalChunks: number;
  processedChunks: number;
  processedChars: number;
  chunks: Map<number, string>;
  matches: SensitiveMatch[];
  startTime: number;
  peakMemory: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progressSubject: Subject<DesensitizeProgress>;
}

@Injectable()
export class StreamingDesensitizeService {
  private readonly logger = new Logger(StreamingDesensitizeService.name);
  private readonly CHUNK_SIZE = 50 * 1024;
  private readonly OVERLAP_SIZE = 256;
  private readonly MAX_IN_MEMORY_CHUNKS = 100;
  private jobs = new Map<string, DesensitizeJob>();

  constructor(private readonly desensitizationService: DesensitizationService) {}

  async desensitizeLargeText(
    fileId: string,
    text: string,
    dto: CreateDesensitizeDto,
  ): Promise<StreamingDesensitizeResult> {
    const startTime = Date.now();
    const totalChars = text.length;
    const { chunks, totalChunks } = this.splitIntoChunks(text);

    this.logger.log(`Starting large file desensitization: ${fileId}, ${totalChars} chars, ${totalChunks} chunks`);

    const allMatches: SensitiveMatch[] = [];
    const processedChunks: string[] = [];
    let peakMemory = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkResult = await this.desensitizationService.processText(chunk.text, dto);

      const adjustedMatches = this.adjustMatchPositions(chunkResult.matches, chunk.charStart);
      allMatches.push(...adjustedMatches);

      processedChunks.push(chunkResult.desensitizedText);

      const currentMem = process.memoryUsage().heapUsed / 1024 / 1024;
      if (currentMem > peakMemory) peakMemory = currentMem;

      if (i > 0 && i % 10 === 0) {
        this.logger.log(`Processed ${i + 1}/${totalChunks} chunks, ${Math.round(currentMem)}MB memory`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    const finalMatches = this.deduplicateMatches(allMatches);
    const statistics = this.buildStatistics(finalMatches);
    const desensitizedText = this.reconstructText(text, finalMatches, dto.mode ?? DesensitizeMode.MASK);

    return {
      desensitizedText,
      matches: finalMatches,
      statistics,
      totalMatchCount: finalMatches.length,
      processingTimeMs: Date.now() - startTime,
      peakMemoryMB: Math.round(peakMemory),
    };
  }

  desensitizeStream(
    fileId: string,
    text: string,
    dto: CreateDesensitizeDto,
  ): Observable<DesensitizeProgress> {
    const totalChars = text.length;
    const { chunks, totalChunks } = this.splitIntoChunks(text);

    const progressSubject = new Subject<DesensitizeProgress>();

    const job: DesensitizeJob = {
      fileId,
      totalChars,
      totalChunks,
      processedChunks: 0,
      processedChars: 0,
      chunks: new Map(),
      matches: [],
      startTime: Date.now(),
      peakMemory: 0,
      status: 'processing',
      progressSubject,
    };

    this.jobs.set(fileId, job);

    this.processChunksAsync(fileId, chunks, text, dto, job)
      .then(() => {
        this.logger.log(`Completed desensitization for ${fileId}`);
      })
      .catch((err) => {
        job.status = 'failed';
        progressSubject.next({
          fileId,
          status: 'failed',
          totalChars,
          processedChars: job.processedChars,
          totalChunks,
          processedChunks: job.processedChunks,
          percent: (job.processedChunks / totalChunks) * 100,
          error: err.message,
        });
        this.logger.error(`Desensitization failed for ${fileId}: ${err.message}`);
      })
      .finally(() => {
        progressSubject.complete();
        setTimeout(() => this.jobs.delete(fileId), 60000);
      });

    return progressSubject.asObservable();
  }

  private async processChunksAsync(
    fileId: string,
    chunks: { text: string; charStart: number; charEnd: number; chunkIndex: number }[],
    fullText: string,
    dto: CreateDesensitizeDto,
    job: DesensitizeJob,
  ): Promise<void> {
    const totalChunks = chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkResult = await this.desensitizationService.processText(chunk.text, dto);

      const adjustedMatches = this.adjustMatchPositions(chunkResult.matches, chunk.charStart);
      job.matches.push(...adjustedMatches);

      job.chunks.set(i, chunkResult.desensitizedText);
      job.processedChunks++;
      job.processedChars = Math.min(chunk.charEnd, job.totalChars);

      const currentMem = process.memoryUsage().heapUsed / 1024 / 1024;
      if (currentMem > job.peakMemory) job.peakMemory = currentMem;

      if (job.chunks.size > this.MAX_IN_MEMORY_CHUNKS) {
        this.persistChunksToTemp(fileId, job.chunks);
        job.chunks.clear();
      }

      job.progressSubject.next({
        fileId,
        status: 'processing',
        totalChars: job.totalChars,
        processedChars: job.processedChars,
        totalChunks,
        processedChunks: job.processedChunks,
        percent: (job.processedChunks / totalChunks) * 100,
        currentChunk: {
          chunkIndex: i,
          totalChunks,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          matchCount: chunkResult.matches.length,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const finalMatches = this.deduplicateMatches(job.matches);
    const desensitizedText = this.reconstructText(fullText, finalMatches, dto.mode ?? DesensitizeMode.MASK);

    job.status = 'completed';
    job.progressSubject.next({
      fileId,
      status: 'completed',
      totalChars: job.totalChars,
      processedChars: job.totalChars,
      totalChunks,
      processedChunks: totalChunks,
      percent: 100,
    });
  }

  private splitIntoChunks(text: string): {
    chunks: { text: string; charStart: number; charEnd: number; chunkIndex: number }[];
    totalChunks: number;
  } {
    const chunks: { text: string; charStart: number; charEnd: number; chunkIndex: number }[] = [];
    let pos = 0;
    let chunkIndex = 0;

    while (pos < text.length) {
      let end = Math.min(pos + this.CHUNK_SIZE, text.length);

      if (end < text.length) {
        const sentenceEnd = this.findSentenceBoundary(text, end, Math.min(end + 200, text.length));
        if (sentenceEnd > pos) {
          end = sentenceEnd;
        }
      }

      const overlapStart = Math.max(0, pos - this.OVERLAP_SIZE);
      const chunkText = text.slice(overlapStart, end);

      chunks.push({
        text: chunkText,
        charStart: overlapStart,
        charEnd: end,
        chunkIndex,
      });

      pos = end;
      chunkIndex++;
    }

    return { chunks, totalChunks: chunks.length };
  }

  private findSentenceBoundary(text: string, start: number, end: number): number {
    const slice = text.slice(start, end);
    const match = slice.match(/[。！？.!?]/);
    if (match && match.index !== undefined) {
      return start + match.index + 1;
    }
    const newline = slice.lastIndexOf('\n');
    if (newline > 0) {
      return start + newline + 1;
    }
    return -1;
  }

  private adjustMatchPositions(matches: SensitiveMatch[], offset: number): SensitiveMatch[] {
    return matches.map((m) => ({
      ...m,
      start: m.start + offset,
      end: m.end + offset,
      _originalStart: m.start,
      _originalEnd: m.end,
    }));
  }

  private deduplicateMatches(matches: SensitiveMatch[]): SensitiveMatch[] {
    const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
    const result: SensitiveMatch[] = [];
    const seen = new Set<string>();

    for (const match of sorted) {
      const key = `${match.start}-${match.end}-${match.type}`;
      if (seen.has(key)) continue;

      if (result.length > 0) {
        const last = result[result.length - 1];
        if (match.start < last.end) {
          if (match.end <= last.end) continue;
          if ((match.end - match.start) > (last.end - last.start)) {
            result[result.length - 1] = match;
            seen.add(key);
            continue;
          }
          continue;
        }
      }

      result.push(match);
      seen.add(key);
    }

    return result;
  }

  private reconstructText(text: string, matches: SensitiveMatch[], mode: DesensitizeMode): string {
    const sorted = [...matches].sort((a, b) => a.start - b.start);
    let result = '';
    let lastEnd = 0;

    for (const match of sorted) {
      if (match.start < lastEnd) continue;
      if (match.start < 0 || match.end > text.length) continue;

      result += text.slice(lastEnd, match.start);

      let replacement: string;
      switch (mode) {
        case DesensitizeMode.REPLACE:
          replacement = `[${match.type.toUpperCase()}]`;
          break;
        case DesensitizeMode.REMOVE:
          replacement = '';
          break;
        case DesensitizeMode.MASK:
        default:
          replacement = match.replacement || '*'.repeat(match.end - match.start);
          break;
      }

      result += replacement;
      lastEnd = match.end;
    }

    result += text.slice(lastEnd);
    return result;
  }

  private buildStatistics(matches: SensitiveMatch[]): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const match of matches) {
      stats[match.type] = (stats[match.type] ?? 0) + 1;
    }
    return stats;
  }

  private persistChunksToTemp(fileId: string, chunks: Map<number, string>): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const tempDir = path.join(process.cwd(), 'temp', fileId);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      for (const [idx, text] of chunks.entries()) {
        fs.writeFileSync(path.join(tempDir, `chunk-${idx}.txt`), text, 'utf-8');
      }
    } catch (e) {
      this.logger.warn(`Failed to persist chunks to temp: ${e}`);
    }
  }

  getProgress(fileId: string): DesensitizeProgress | undefined {
    const job = this.jobs.get(fileId);
    if (!job) return undefined;

    return {
      fileId,
      status: job.status,
      totalChars: job.totalChars,
      processedChars: job.processedChars,
      totalChunks: job.totalChunks,
      processedChunks: job.processedChunks,
      percent: (job.processedChunks / job.totalChunks) * 100,
    };
  }

  cancelJob(fileId: string): boolean {
    const job = this.jobs.get(fileId);
    if (!job) return false;
    job.status = 'failed';
    job.progressSubject.error(new Error('Cancelled by user'));
    job.progressSubject.complete();
    this.jobs.delete(fileId);
    return true;
  }

  calculateTextHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }
}
