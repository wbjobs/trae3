import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DrawingFile, DrawingFormat, ConvertTask } from '@shared/types';
import { SUPPORTED_FORMATS } from '@shared/constants';

interface ConverterPipeline {
  sourceFormat: DrawingFormat;
  targetFormat: DrawingFormat;
  convert: (input: Buffer, options?: ConvertOptions) => Promise<Buffer>;
}

interface ConvertOptions {
  quality?: number;
  scale?: number;
  dpi?: number;
  page?: number;
  batchId?: string;
}

interface LRUNode {
  key: string;
  value: Buffer;
  accessTime: number;
  size: number;
}

class LRUCache {
  private cache: Map<string, LRUNode> = new Map();
  private maxSize: number;
  private currentSize: number = 0;

  constructor(maxSize: number = 100 * 1024 * 1024) {
    this.maxSize = maxSize;
  }

  get(key: string): Buffer | null {
    const node = this.cache.get(key);
    if (!node) return null;
    node.accessTime = Date.now();
    return node.value;
  }

  set(key: string, value: Buffer): void {
    const size = value.length;
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [k, v] of this.cache.entries()) {
        if (v.accessTime < oldestTime) {
          oldestTime = v.accessTime;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        const old = this.cache.get(oldestKey)!;
        this.currentSize -= old.size;
        this.cache.delete(oldestKey);
      }
    }
    this.currentSize += size;
    this.cache.set(key, { key, value, accessTime: Date.now(), size });
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  stats() {
    return { entries: this.cache.size, size: this.currentSize, maxSize: this.maxSize };
  }
}

interface WorkItem {
  id: string;
  taskFn: () => Promise<Buffer>;
  resolve: (value: Buffer) => void;
  reject: (reason: any) => void;
  startTime: number;
  timeout?: NodeJS.Timeout;
}

class WorkerThreadPool {
  private queue: WorkItem[] = [];
  private activeWorkers: number = 0;
  private maxWorkers: number;
  private maxQueueSize: number;
  private totalProcessed: number = 0;
  private totalTime: number = 0;

  constructor(maxWorkers: number = Math.max(2, require('os').cpus().length - 1), maxQueueSize: number = 100) {
    this.maxWorkers = maxWorkers;
    this.maxQueueSize = maxQueueSize;
  }

  async submit(taskFn: () => Promise<Buffer>, taskId: string): Promise<Buffer> {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('转换队列已满，请稍后重试');
    }
    return new Promise((resolve, reject) => {
      const workItem: WorkItem = {
        id: taskId,
        taskFn,
        resolve,
        reject,
        startTime: Date.now(),
        timeout: setTimeout(() => {
          this.cleanupTask(taskId);
          reject(new Error('转换超时'));
        }, 5 * 60 * 1000),
      };
      this.queue.push(workItem);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.activeWorkers >= this.maxWorkers || this.queue.length === 0) return;

    const item = this.queue.shift()!;
    this.activeWorkers++;

    item.taskFn()
      .then((result) => {
        if (item.timeout) clearTimeout(item.timeout);
        this.totalProcessed++;
        this.totalTime += Date.now() - item.startTime;
        item.resolve(result);
      })
      .catch((err) => {
        if (item.timeout) clearTimeout(item.timeout);
        item.reject(err);
      })
      .finally(() => {
        this.activeWorkers--;
        this.processQueue();
      });
  }

  private cleanupTask(taskId: string): void {
    const idx = this.queue.findIndex((w) => w.id === taskId);
    if (idx >= 0) {
      const item = this.queue[idx];
      if (item.timeout) clearTimeout(item.timeout);
      this.queue.splice(idx, 1);
    }
  }

  cancel(taskId: string): boolean {
    this.cleanupTask(taskId);
    return true;
  }

  stats() {
    return {
      active: this.activeWorkers,
      queued: this.queue.length,
      processed: this.totalProcessed,
      avgTimeMs: this.totalProcessed > 0 ? Math.round(this.totalTime / this.totalProcessed) : 0,
    };
  }
}

class DrawingConverter {
  private pipelines: Map<string, ConverterPipeline> = new Map();
  private tasks: Map<string, ConvertTask> = new Map();
  private cancelledTasks: Set<string> = new Set();
  private workerProcesses: Map<string, any> = new Map();
  private threadPool: WorkerThreadPool;
  private pipelineCache: LRUCache;
  private parsingCache: LRUCache;
  private batchTasks: Map<string, ConvertTask[]> = new Map();

  constructor() {
    this.threadPool = new WorkerThreadPool();
    this.pipelineCache = new LRUCache(50 * 1024 * 1024);
    this.parsingCache = new LRUCache(30 * 1024 * 1024);
    this.registerPipelines();
  }

  private registerPipelines(): void {
    this.registerPipeline('pdf', 'svg', this.pdfToSvg.bind(this));
    this.registerPipeline('pdf', 'png', this.pdfToImage.bind(this));
    this.registerPipeline('pdf', 'jpg', this.pdfToImage.bind(this));
    this.registerPipeline('svg', 'pdf', this.svgToPdf.bind(this));
    this.registerPipeline('svg', 'png', this.svgToImage.bind(this));
    this.registerPipeline('svg', 'jpg', this.svgToImage.bind(this));
    this.registerPipeline('dxf', 'svg', this.dxfToSvg.bind(this));
    this.registerPipeline('dxf', 'pdf', this.dxfToPdf.bind(this));
    this.registerPipeline('dwg', 'dxf', this.dwgToDxf.bind(this));
    this.registerPipeline('dwg', 'svg', this.dwgToSvg.bind(this));
    this.registerPipeline('dwg', 'pdf', this.dwgToPdf.bind(this));
  }

  private registerPipeline(
    source: DrawingFormat,
    target: DrawingFormat,
    convertFn: (input: Buffer, options?: ConvertOptions) => Promise<Buffer>
  ): void {
    const key = `${source}->${target}`;
    this.pipelines.set(key, { sourceFormat: source, targetFormat: target, convert: convertFn });
  }

  getCacheStats() {
    return {
      pipeline: this.pipelineCache.stats(),
      parsing: this.parsingCache.stats(),
      threadPool: this.threadPool.stats(),
    };
  }

  async startBatchConversion(
    sourceFiles: DrawingFile[],
    targetFormat: DrawingFormat,
    outputDir: string,
    options?: ConvertOptions
  ): Promise<ConvertTask[]> {
    const batchId = uuidv4();
    const tasks: ConvertTask[] = [];

    for (const file of sourceFiles) {
      const task = await this.startConversion(file, targetFormat, outputDir, {
        ...options,
        batchId,
      });
      tasks.push(task);
    }

    this.batchTasks.set(batchId, tasks);
    return tasks;
  }

  async startConversion(
    sourceFile: DrawingFile,
    targetFormat: DrawingFormat,
    outputDir: string,
    options?: ConvertOptions
  ): Promise<ConvertTask> {
    const key = `${sourceFile.format}->${targetFormat}`;

    if (!this.pipelines.has(key)) {
      throw new Error(`不支持的转换: ${sourceFile.format} -> ${targetFormat}`);
    }

    if (!SUPPORTED_FORMATS.output.includes(targetFormat)) {
      throw new Error(`不支持的输出格式: ${targetFormat}`);
    }

    const task: ConvertTask = {
      id: uuidv4(),
      sourceFile,
      targetFormat,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);

    this.safeExecuteConversion(task, outputDir, options).catch((err) => {
      task.status = 'failed';
      task.error = err.message || '转换失败';
    });

    return task;
  }

  private async safeExecuteConversion(
    task: ConvertTask,
    outputDir: string,
    options?: ConvertOptions
  ): Promise<void> {
    try {
      await this.executeConversion(task, outputDir, options);
    } catch (err: any) {
      task.status = 'failed';
      task.error = err.message || '转换过程异常';
    } finally {
      this.workerProcesses.delete(task.id);
    }
  }

  private async executeConversion(
    task: ConvertTask,
    outputDir: string,
    options?: ConvertOptions
  ): Promise<void> {
    const key = `${task.sourceFile.format}->${task.targetFormat}`;
    const pipeline = this.pipelines.get(key);
    if (!pipeline) {
      throw new Error('转换管线不存在');
    }

    task.status = 'processing';
    task.progress = 10;

    let inputBuffer: Buffer;
    try {
      inputBuffer = await fs.readFile(task.sourceFile.path);
    } catch (err: any) {
      throw new Error(`读取源文件失败: ${err.message}`);
    }
    task.progress = 20;

    const cacheKey = `${key}:${crypto.createHash('md5').update(inputBuffer).digest('hex')}:${JSON.stringify(options || {})}`;
    const cached = this.pipelineCache.get(cacheKey);
    if (cached) {
      task.progress = 85;
    }

    if (this.cancelledTasks.has(task.id)) {
      task.status = 'failed';
      task.error = '任务已取消';
      this.cancelledTasks.delete(task.id);
      return;
    }

    let outputBuffer: Buffer;
    try {
      if (cached) {
        outputBuffer = cached;
      } else {
        outputBuffer = await this.threadPool.submit(
          () => pipeline.convert(inputBuffer, options),
          task.id
        );
        this.pipelineCache.set(cacheKey, outputBuffer);
      }
    } catch (err: any) {
      throw new Error(`格式转换失败: ${err.message}`);
    }
    task.progress = 85;

    const sourceName = path.basename(task.sourceFile.name);
    const ext = path.extname(sourceName);
    const baseName = ext ? sourceName.slice(0, -ext.length) : sourceName;
    const outputName = `${baseName}.${task.targetFormat}`;
    const outputPath = path.join(outputDir, outputName);

    try {
      await fs.ensureDir(outputDir);
      await fs.writeFile(outputPath, outputBuffer);
    } catch (err: any) {
      throw new Error(`写入输出文件失败: ${err.message}`);
    }

    task.progress = 100;
    task.status = 'completed';
    task.outputPath = outputPath;
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.cancelledTasks.add(taskId);
    this.threadPool.cancel(taskId);

    const worker = this.workerProcesses.get(taskId);
    if (worker && typeof worker.kill === 'function') {
      try { worker.kill('SIGTERM'); } catch { /* ignore */ }
    }
    this.workerProcesses.delete(taskId);

    if (task.status === 'processing' || task.status === 'pending') {
      task.status = 'failed';
      task.error = '已取消';
    }
    return true;
  }

  getTask(taskId: string): ConvertTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): ConvertTask[] {
    return Array.from(this.tasks.values());
  }

  private async pdfToSvg(input: Buffer, options?: ConvertOptions): Promise<Buffer> {
    const page = options?.page ?? 1;
    const svgContent = this.buildSvgFromPdfStructure(input, page);
    return Buffer.from(svgContent, 'utf-8');
  }

  private async pdfToImage(input: Buffer, options?: ConvertOptions): Promise<Buffer> {
    const dpi = options?.dpi ?? 150;
    const scale = options?.scale ?? dpi / 72;
    const quality = options?.quality ?? 90;
    return this.renderPdfToImage(input, scale, quality);
  }

  private async svgToPdf(input: Buffer, _options?: ConvertOptions): Promise<Buffer> {
    const svgContent = input.toString('utf-8');
    return this.buildPdfFromSvg(svgContent);
  }

  private async svgToImage(input: Buffer, options?: ConvertOptions): Promise<Buffer> {
    const scale = options?.scale ?? 2;
    const quality = options?.quality ?? 90;
    return this.renderSvgToImage(input, scale, quality);
  }

  private async dxfToSvg(input: Buffer, _options?: ConvertOptions): Promise<Buffer> {
    const hash = crypto.createHash('md5').update(input).digest('hex');
    const cached = this.parsingCache.get(`dxf:${hash}`);
    if (cached) return cached;

    const dxfContent = input.toString('utf-8');
    const svg = this.parseDxfToSvgOptimized(dxfContent);
    const result = Buffer.from(svg, 'utf-8');
    this.parsingCache.set(`dxf:${hash}`, result);
    return result;
  }

  private async dxfToPdf(input: Buffer, options?: ConvertOptions): Promise<Buffer> {
    const svgBuffer = await this.dxfToSvg(input, options);
    return this.svgToPdf(svgBuffer, options);
  }

  private async dwgToDxf(input: Buffer, _options?: ConvertOptions): Promise<Buffer> {
    return this.convertDwgToDxfInternal(input);
  }

  private async dwgToSvg(input: Buffer, options?: ConvertOptions): Promise<Buffer> {
    const dxfBuffer = await this.dwgToDxf(input, options);
    return this.dxfToSvg(dxfBuffer, options);
  }

  private async dwgToPdf(input: Buffer, options?: ConvertOptions): Promise<Buffer> {
    const svgBuffer = await this.dwgToSvg(input, options);
    return this.svgToPdf(svgBuffer, options);
  }

  private buildSvgFromPdfStructure(input: Buffer, page: number): string {
    const width = 595;
    const height = 842;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<desc>Converted from PDF page ${page}</desc>`,
      '<rect width="100%" height="100%" fill="white"/>',
      `<text x="50%" y="50%" text-anchor="middle" font-size="14" fill="#333">`,
      `PDF Page ${page} - SVG Conversion Output`,
      '</text>',
      '</svg>',
    ].join('\n');
  }

  private async renderPdfToImage(input: Buffer, scale: number, quality: number): Promise<Buffer> {
    const width = Math.round(595 * scale);
    const height = Math.round(842 * scale);
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    return Buffer.concat([
      pngHeader,
      Buffer.from(`[PDF→Image placeholder: ${width}x${height}, quality=${quality}]`),
    ]);
  }

  private buildPdfFromSvg(svgContent: string): Promise<Buffer> {
    const pdfStructure = [
      '%PDF-1.4',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj',
      'xref',
      '0 4',
      'trailer<</Size 4/Root 1 0 R>>',
      'startxref',
      '0',
      '%%EOF',
    ].join('\n');
    return Promise.resolve(Buffer.from(pdfStructure, 'utf-8'));
  }

  private async renderSvgToImage(input: Buffer, scale: number, quality: number): Promise<Buffer> {
    const svgContent = input.toString('utf-8');
    const widthMatch = svgContent.match(/width="(\d+)"/);
    const heightMatch = svgContent.match(/height="(\d+)"/);
    const w = widthMatch ? parseInt(widthMatch[1]) * scale : 800;
    const h = heightMatch ? parseInt(heightMatch[1]) * scale : 600;
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    return Buffer.concat([
      pngHeader,
      Buffer.from(`[SVG→Image placeholder: ${w}x${h}, quality=${quality}]`),
    ]);
  }

  private parseDxfToSvgOptimized(dxfContent: string): string {
    const lines = this.safeSplitLines(dxfContent);
    const entities: string[] = [];
    let i = 0;
    const len = lines.length;

    const fastParseFloat = (s: string): number => {
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    };

    while (i < len) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      if (!line1 || line1.trim() === '') { i++; continue; }

      const code = parseInt(line1.trim(), 10);
      if (isNaN(code)) { i++; continue; }
      const value = line2?.trim() ?? '';

      if (code === 0 && value === 'LINE') {
        i += 2;
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        while (i < len) {
          const l1 = lines[i];
          const l2 = lines[i + 1];
          if (!l1?.trim()) { i++; continue; }
          const c = parseInt(l1.trim(), 10);
          const v = l2?.trim() ?? '';
          if (isNaN(c)) { i++; continue; }
          if (c === 0) break;
          if (c === 10) x1 = fastParseFloat(v);
          if (c === 20) y1 = fastParseFloat(v);
          if (c === 11) x2 = fastParseFloat(v);
          if (c === 21) y2 = fastParseFloat(v);
          i += 2;
        }
        entities.push(`<line x1="${x1}" y1="${-y1}" x2="${x2}" y2="${-y2}" stroke="black" stroke-width="1"/>`);
        continue;
      }

      if (code === 0 && value === 'CIRCLE') {
        i += 2;
        let cx = 0, cy = 0, r = 0;
        while (i < len) {
          const l1 = lines[i];
          const l2 = lines[i + 1];
          if (!l1?.trim()) { i++; continue; }
          const c = parseInt(l1.trim(), 10);
          const v = l2?.trim() ?? '';
          if (isNaN(c)) { i++; continue; }
          if (c === 0) break;
          if (c === 10) cx = fastParseFloat(v);
          if (c === 20) cy = fastParseFloat(v);
          if (c === 40) r = fastParseFloat(v);
          i += 2;
        }
        entities.push(`<circle cx="${cx}" cy="${-cy}" r="${r}" fill="none" stroke="black" stroke-width="1"/>`);
        continue;
      }

      if (code === 0 && value === 'ARC') {
        i += 2;
        let cx = 0, cy = 0, r = 0, sa = 0, ea = 90;
        while (i < len) {
          const l1 = lines[i];
          const l2 = lines[i + 1];
          if (!l1?.trim()) { i++; continue; }
          const c = parseInt(l1.trim(), 10);
          const v = l2?.trim() ?? '';
          if (isNaN(c)) { i++; continue; }
          if (c === 0) break;
          if (c === 10) cx = fastParseFloat(v);
          if (c === 20) cy = fastParseFloat(v);
          if (c === 40) r = fastParseFloat(v);
          if (c === 50) sa = fastParseFloat(v);
          if (c === 51) ea = fastParseFloat(v);
          i += 2;
        }
        const sx = cx + r * Math.cos(sa * Math.PI / 180);
        const sy = -cy + r * Math.sin(sa * Math.PI / 180);
        const ex = cx + r * Math.cos(ea * Math.PI / 180);
        const ey = -cy + r * Math.sin(ea * Math.PI / 180);
        const largeArc = Math.abs(ea - sa) > 180 ? 1 : 0;
        const sweep = ea > sa ? 1 : 0;
        entities.push(`<path d="M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} ${sweep} ${ex} ${ey}" fill="none" stroke="black" stroke-width="1"/>`);
        continue;
      }

      if (code === 0 && value === 'TEXT') {
        i += 2;
        let x = 0, y = 0, height = 2.5, text = '';
        while (i < len) {
          const l1 = lines[i];
          const l2 = lines[i + 1];
          if (!l1?.trim()) { i++; continue; }
          const c = parseInt(l1.trim(), 10);
          const v = l2 ?? '';
          if (isNaN(c)) { i++; continue; }
          if (c === 0) break;
          if (c === 10) x = fastParseFloat(v);
          if (c === 20) y = fastParseFloat(v);
          if (c === 40) height = fastParseFloat(v);
          if (c === 1) text = v;
          i += 2;
        }
        if (text) {
          entities.push(`<text x="${x}" y="${-y}" font-size="${height}" fill="black">${this.escapeXml(text)}</text>`);
        }
        continue;
      }

      i += 2;
    }

    const bounds = entities.length > 0 ? this.calculateBounds(entities) : { minX: -500, minY: -500, maxX: 500, maxY: 500 };
    const vbX = Math.floor(bounds.minX - 50);
    const vbY = Math.floor(bounds.minY - 50);
    const vbW = Math.ceil(bounds.maxX - vbX + 100);
    const vbH = Math.ceil(bounds.maxY - vbY + 100);

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">`,
      '<rect width="100%" height="100%" fill="white"/>',
      '<g transform="scale(1,-1)">',
      ...entities,
      '</g>',
      '</svg>',
    ].join('\n');
  }

  private safeSplitLines(content: string): string[] {
    const result: string[] = [];
    let current = '';
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (ch === '\n' || ch === '\r') {
        if (current.length > 0 || result.length > 0) {
          result.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
    if (current.length > 0) result.push(current);
    return result;
  }

  private calculateBounds(entities: string[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const coordRegex = /[xy](?:1|2)?="([-\d.]+)"/g;
    for (const entity of entities) {
      let match;
      while ((match = coordRegex.exec(entity)) !== null) {
        const v = parseFloat(match[1]);
        if (!isNaN(v)) {
          if (v < minX) minX = v;
          if (v > maxX) maxX = v;
          if (v < minY) minY = v;
          if (v > maxY) maxY = v;
        }
      }
    }
    return { minX, minY, maxX, maxY };
  }

  private escapeXml(text: string): string {
    return text.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case "'": return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  private convertDwgToDxfInternal(input: Buffer): Promise<Buffer> {
    const dxfContent = [
      '0', 'SECTION',
      '2', 'HEADER',
      '0', 'ENDSEC',
      '0', 'SECTION',
      '2', 'ENTITIES',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n');
    return Promise.resolve(Buffer.from(dxfContent, 'utf-8'));
  }

  clearCaches(): void {
    this.pipelineCache.clear();
    this.parsingCache.clear();
  }
}

export const drawingConverter = new DrawingConverter();
export { DrawingConverter, LRUCache, WorkerThreadPool };
