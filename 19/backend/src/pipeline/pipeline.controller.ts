import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { Pipeline } from './pipeline.schema';
import { CreatePipelineDto, UpdatePipelineDto } from './dto/create-pipeline.dto';
import { validatePipelineData, sanitizePipeline, isValidPipeline } from '../../../shared/validators';

@Controller('pipelines')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  async findAll(@Query('type') type?: string): Promise<Pipeline[]> {
    if (type && !['water', 'sewage', 'electric', 'gas', 'heat'].includes(type)) {
      throw new BadRequestException(`Invalid pipeline type: ${type}`);
    }
    return this.pipelineService.findAll(type);
  }

  @Get('types')
  async getPipelineTypes(): Promise<string[]> {
    return this.pipelineService.getPipelineTypes();
  }

  @Get('stats')
  async getStats(): Promise<any> {
    return this.pipelineService.getStats();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Pipeline> {
    const pipeline = await this.pipelineService.findOne(id);
    if (!pipeline) {
      throw new BadRequestException(`Pipeline not found with id: ${id}`);
    }
    return pipeline;
  }

  @Post()
  async create(@Body() createPipelineDto: CreatePipelineDto): Promise<Pipeline> {
    const sanitized = sanitizePipeline(createPipelineDto);
    
    if (!isValidPipeline(sanitized)) {
      throw new BadRequestException('Invalid pipeline data format');
    }
    
    return this.pipelineService.create(sanitized);
  }

  @Post('batch')
  async batchCreate(@Body() pipelines: any[]): Promise<{ created: number; invalid: number; results: Pipeline[] }> {
    if (!Array.isArray(pipelines)) {
      throw new BadRequestException('Expected an array of pipelines');
    }
    
    const { valid, invalid } = validatePipelineData(pipelines);
    
    if (valid.length === 0) {
      throw new BadRequestException('No valid pipeline data provided');
    }
    
    const results = await this.pipelineService.batchCreate(valid);
    
    return {
      created: results.length,
      invalid: invalid.length,
      results,
    };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updatePipelineDto: UpdatePipelineDto,
  ): Promise<Pipeline> {
    const existing = await this.pipelineService.findOne(id);
    if (!existing) {
      throw new BadRequestException(`Pipeline not found with id: ${id}`);
    }
    
    const sanitized = sanitizePipeline({ ...existing.toObject(), ...updatePipelineDto });
    
    if (!isValidPipeline(sanitized)) {
      throw new BadRequestException('Invalid pipeline data format');
    }
    
    return this.pipelineService.update(id, sanitized);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    const result = await this.pipelineService.delete(id);
    if (!result) {
      throw new BadRequestException(`Pipeline not found with id: ${id}`);
    }
    return { success: true, message: 'Pipeline deleted successfully' };
  }
}
