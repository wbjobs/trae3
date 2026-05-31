import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as os from 'os';
import * as v8 from 'v8';

export interface SystemResources {
  cpuUsage: number;
  memoryUsageMB: number;
  memoryPercent: number;
  totalMemoryMB: number;
  freeMemoryMB: number;
  loadAverage: number[];
  uptimeSeconds: number;
  nodeMemoryMB: number;
  nodeHeapUsedMB: number;
  nodeHeapTotalMB: number;
}

export interface ResourceThresholds {
  maxMemoryPercent: number;
  maxCpuPercent: number;
  autoGcThreshold: number;
  requestThrottleThreshold: number;
}

export interface HardwareConfig {
  cpuThreads: number;
  memoryLimitMB: number;
  quantizationLevel: 'none' | 'int8' | 'int4';
  modelPrecision: 'fp32' | 'fp16' | 'int8';
  enableCpuAffinity: boolean;
  maxConcurrentRequests: number;
}

export interface OptimizationStats {
  totalGcRuns: number;
  totalRequestsThrottled: number;
  totalMemoryFreedMB: number;
  avgResponseTimeMs: number;
  currentConcurrency: number;
}

@Injectable()
export class HardwareOptimizationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HardwareOptimizationService.name);
  private thresholds: ResourceThresholds;
  private config: HardwareConfig;
  private stats: OptimizationStats = {
    totalGcRuns: 0,
    totalRequestsThrottled: 0,
    totalMemoryFreedMB: 0,
    avgResponseTimeMs: 0,
    currentConcurrency: 0,
  };
  private monitorInterval: NodeJS.Timeout | null = null;
  private requestQueue: Array<() => Promise<any>> = [];
  private activeRequests = 0;
  private readonly MAX_QUEUE_SIZE = 50;
  private readonly MONITOR_INTERVAL_MS = 5000;

  constructor() {
    this.loadConfig();
  }

  onModuleInit(): void {
    this.startResourceMonitor();
    this.logHardwareConfig();
  }

  onModuleDestroy(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }

  private loadConfig(): void {
    const totalCores = os.cpus().length;
    const totalMemoryMB = Math.floor(os.totalmem() / 1024 / 1024);

    this.config = {
      cpuThreads: parseInt(process.env.CPU_THREADS, 10) || Math.max(1, Math.min(totalCores, 4)),
      memoryLimitMB: parseInt(process.env.MEMORY_LIMIT_MB, 10) || Math.floor(totalMemoryMB * 0.7),
      quantizationLevel: (process.env.QUANTIZATION_LEVEL as 'none' | 'int8' | 'int4') || 'int8',
      modelPrecision: (process.env.MODEL_PRECISION as 'fp32' | 'fp16' | 'int8') || 'int8',
      enableCpuAffinity: process.env.ENABLE_CPU_AFFINITY === 'true',
      maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) || 5,
    };

    this.thresholds = {
      maxMemoryPercent: parseInt(process.env.MAX_MEMORY_PERCENT, 10) || 80,
      maxCpuPercent: parseInt(process.env.MAX_CPU_PERCENT, 10) || 90,
      autoGcThreshold: parseInt(process.env.AUTO_GC_THRESHOLD, 10) || 70,
      requestThrottleThreshold: parseInt(process.env.REQUEST_THROTTLE_THRESHOLD, 10) || 85,
    };

    if (process.env.NODE_ENV !== 'production') {
      v8.setFlagsFromString(`--max-old-space-size=${this.config.memoryLimitMB}`);
    }
  }

  private logHardwareConfig(): void {
    this.logger.log('=== Hardware Optimization Configuration ===');
    this.logger.log(`CPU Threads: ${this.config.cpuThreads} / ${os.cpus().length} available`);
    this.logger.log(`Memory Limit: ${this.config.memoryLimitMB}MB / ${Math.floor(os.totalmem() / 1024 / 1024)}MB total`);
    this.logger.log(`Quantization: ${this.config.quantizationLevel}`);
    this.logger.log(`Model Precision: ${this.config.modelPrecision}`);
    this.logger.log(`Max Concurrent Requests: ${this.config.maxConcurrentRequests}`);
    this.logger.log(`Auto GC Threshold: ${this.thresholds.autoGcThreshold}%`);
    this.logger.log('==========================================');
  }

  private startResourceMonitor(): void {
    this.monitorInterval = setInterval(() => {
      const resources = this.getSystemResources();
      this.checkResourceThresholds(resources);
    }, this.MONITOR_INTERVAL_MS);

    this.logger.log('Resource monitor started');
  }

  getSystemResources(): SystemResources {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const nodeUsage = process.memoryUsage();

    return {
      cpuUsage: this.getCpuUsage(),
      memoryUsageMB: Math.floor(usedMemory / 1024 / 1024),
      memoryPercent: (usedMemory / totalMemory) * 100,
      totalMemoryMB: Math.floor(totalMemory / 1024 / 1024),
      freeMemoryMB: Math.floor(freeMemory / 1024 / 1024),
      loadAverage: os.loadavg(),
      uptimeSeconds: os.uptime(),
      nodeMemoryMB: Math.floor(nodeUsage.rss / 1024 / 1024),
      nodeHeapUsedMB: Math.floor(nodeUsage.heapUsed / 1024 / 1024),
      nodeHeapTotalMB: Math.floor(nodeUsage.heapTotal / 1024 / 1024),
    };
  }

  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type of Object.keys(cpu.times)) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    return Math.round(((totalTick - totalIdle) / totalTick) * 100);
  }

  private checkResourceThresholds(resources: SystemResources): void {
    if (resources.memoryPercent > this.thresholds.autoGcThreshold) {
      this.logger.warn(`Memory usage ${resources.memoryPercent.toFixed(1)}% exceeds GC threshold, triggering garbage collection`);
      this.runGarbageCollection();
    }

    if (resources.memoryPercent > this.thresholds.requestThrottleThreshold ||
        resources.cpuUsage > this.thresholds.maxCpuPercent) {
      this.logger.warn(`Resources high - CPU: ${resources.cpuUsage}%, Memory: ${resources.memoryPercent.toFixed(1)}%`);
    }

    if (resources.memoryPercent > 95) {
      this.logger.error(`CRITICAL: Memory usage ${resources.memoryPercent.toFixed(1)}%, emergency GC`);
      this.runGarbageCollection(true);
    }
  }

  runGarbageCollection(force = false): number {
    const beforeMB = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);

    if (global.gc && (force || beforeMB > this.config.memoryLimitMB * 0.7)) {
      try {
        global.gc();
        const afterMB = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);
        const freedMB = beforeMB - afterMB;

        this.stats.totalGcRuns++;
        this.stats.totalMemoryFreedMB += Math.max(0, freedMB);

        this.logger.log(`Garbage collection completed - freed ~${freedMB}MB (${beforeMB}MB → ${afterMB}MB)`);
        return freedMB;
      } catch (e) {
        this.logger.error(`GC failed: ${e}`);
      }
    }

    return 0;
  }

  async executeWithThrottling<T>(fn: () => Promise<T>, priority = 'normal'): Promise<T> {
    const resources = this.getSystemResources();

    if (resources.memoryPercent > this.thresholds.requestThrottleThreshold) {
      this.stats.totalRequestsThrottled++;
      this.logger.warn(`Request throttled - memory: ${resources.memoryPercent.toFixed(1)}%`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
        throw new Error('Request queue full, please try again later');
      }

      return new Promise((resolve, reject) => {
        const queuedFn = async () => {
          try {
            this.activeRequests++;
            const result = await fn();
            resolve(result);
          } catch (e) {
            reject(e);
          } finally {
            this.activeRequests--;
            this.processQueue();
          }
        };
        this.requestQueue.push(queuedFn);
      });
    }

    this.activeRequests++;
    this.stats.currentConcurrency = this.activeRequests;

    try {
      const result = await fn();
      return result;
    } finally {
      this.activeRequests--;
      this.stats.currentConcurrency = this.activeRequests;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.requestQueue.length > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
      const nextFn = this.requestQueue.shift();
      if (nextFn) {
        nextFn();
      }
    }
  }

  getConfig(): HardwareConfig {
    return { ...this.config };
  }

  getStats(): OptimizationStats & { queueSize: number; activeRequests: number } {
    return {
      ...this.stats,
      queueSize: this.requestQueue.length,
      activeRequests: this.activeRequests,
    };
  }

  async optimizeMemory(): Promise<void> {
    this.logger.log('Running memory optimization...');
    this.runGarbageCollection(true);

    if (global.gc) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      this.runGarbageCollection(true);
    }

    const resources = this.getSystemResources();
    this.logger.log(`Memory optimization complete - usage: ${resources.memoryPercent.toFixed(1)}%`);
  }

  canAcceptRequest(): boolean {
    const resources = this.getSystemResources();
    return (
      resources.memoryPercent < this.thresholds.requestThrottleThreshold &&
      resources.cpuUsage < this.thresholds.maxCpuPercent &&
      this.activeRequests < this.config.maxConcurrentRequests &&
      this.requestQueue.length < this.MAX_QUEUE_SIZE
    );
  }

  setConfig(config: Partial<HardwareConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log(`Hardware config updated: ${JSON.stringify(config)}`);
  }

  setThresholds(thresholds: Partial<ResourceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.logger.log(`Resource thresholds updated: ${JSON.stringify(thresholds)}`);
  }

  resetStats(): void {
    this.stats = {
      totalGcRuns: 0,
      totalRequestsThrottled: 0,
      totalMemoryFreedMB: 0,
      avgResponseTimeMs: 0,
      currentConcurrency: 0,
    };
    this.logger.log('Optimization stats reset');
  }

  getOptimizationRecommendations(): string[] {
    const resources = this.getSystemResources();
    const recommendations: string[] = [];

    if (resources.memoryPercent > 70) {
      recommendations.push('内存使用率较高，建议启用 INT4 量化减少模型内存占用');
    }

    if (resources.cpuUsage > 70) {
      recommendations.push('CPU 使用率较高，建议减少并发数或升级硬件');
    }

    if (this.stats.totalRequestsThrottled > 10) {
      recommendations.push('请求被节流次数较多，建议增加硬件资源或降低负载');
    }

    if (this.config.quantizationLevel === 'none') {
      recommendations.push('建议启用 INT8 量化以减少约 50% 内存占用');
    }

    if (recommendations.length === 0) {
      recommendations.push('系统资源使用正常，当前配置良好');
    }

    return recommendations;
  }
}
