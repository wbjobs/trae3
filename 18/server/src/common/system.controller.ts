import { Controller, Get, Post, Body } from '@nestjs/common';
import {
  HardwareOptimizationService,
  SystemResources,
  HardwareConfig,
  ResourceThresholds,
} from './hardware-optimization.service';

@Controller('system')
export class SystemController {
  constructor(private readonly hardwareService: HardwareOptimizationService) {}

  @Get('resources')
  async getSystemResources(): Promise<{ resources: SystemResources }> {
    return {
      resources: this.hardwareService.getSystemResources(),
    };
  }

  @Get('config')
  async getHardwareConfig(): Promise<{ config: HardwareConfig }> {
    return {
      config: this.hardwareService.getConfig(),
    };
  }

  @Get('stats')
  async getStats(): Promise<{ stats: any }> {
    return {
      stats: this.hardwareService.getStats(),
    };
  }

  @Get('recommendations')
  async getRecommendations(): Promise<{ recommendations: string[] }> {
    return {
      recommendations: this.hardwareService.getOptimizationRecommendations(),
    };
  }

  @Post('optimize-memory')
  async optimizeMemory(): Promise<{ success: boolean; message: string }> {
    await this.hardwareService.optimizeMemory();
    return {
      success: true,
      message: 'Memory optimization completed',
    };
  }

  @Post('gc')
  async runGC(): Promise<{ success: boolean; freedMB: number }> {
    const freedMB = this.hardwareService.runGarbageCollection(true);
    return {
      success: true,
      freedMB,
    };
  }

  @Post('config')
  async updateConfig(
    @Body() config: Partial<HardwareConfig>,
  ): Promise<{ success: boolean; config: HardwareConfig }> {
    this.hardwareService.setConfig(config);
    return {
      success: true,
      config: this.hardwareService.getConfig(),
    };
  }

  @Post('thresholds')
  async updateThresholds(
    @Body() thresholds: Partial<ResourceThresholds>,
  ): Promise<{ success: boolean; thresholds: ResourceThresholds }> {
    this.hardwareService.setThresholds(thresholds);
    return {
      success: true,
      thresholds: thresholds as ResourceThresholds,
    };
  }

  @Post('reset-stats')
  async resetStats(): Promise<{ success: boolean }> {
    this.hardwareService.resetStats();
    return { success: true };
  }

  @Get('health')
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    canAcceptRequests: boolean;
    resources: SystemResources;
  }> {
    const resources = this.hardwareService.getSystemResources();
    const canAccept = this.hardwareService.canAcceptRequest();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (resources.memoryPercent > 90 || resources.cpuUsage > 95) {
      status = 'unhealthy';
    } else if (resources.memoryPercent > 75 || resources.cpuUsage > 80) {
      status = 'degraded';
    }

    return {
      status,
      canAcceptRequests: canAccept,
      resources,
    };
  }
}
