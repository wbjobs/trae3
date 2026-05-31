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
import { AnnotationService } from './annotation.service';
import { Annotation } from './annotation.schema';
import { CreateAnnotationDto, UpdateAnnotationDto } from './dto/create-annotation.dto';
import { validateAnnotationData, sanitizeAnnotation, isValidAnnotation } from '../../../shared/validators';

@Controller('annotations')
export class AnnotationController {
  constructor(private readonly annotationService: AnnotationService) {}

  @Get()
  async findAll(
    @Query('pipelineId') pipelineId?: string,
  ): Promise<Annotation[]> {
    return this.annotationService.findAll(pipelineId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Annotation> {
    const annotation = await this.annotationService.findOne(id);
    if (!annotation) {
      throw new BadRequestException(`Annotation not found with id: ${id}`);
    }
    return annotation;
  }

  @Post()
  async create(@Body() createAnnotationDto: CreateAnnotationDto): Promise<Annotation> {
    const sanitized = sanitizeAnnotation(createAnnotationDto);
    
    if (!isValidAnnotation(sanitized)) {
      throw new BadRequestException('Invalid annotation data format');
    }
    
    return this.annotationService.create(sanitized);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAnnotationDto: UpdateAnnotationDto,
  ): Promise<Annotation> {
    const existing = await this.annotationService.findOne(id);
    if (!existing) {
      throw new BadRequestException(`Annotation not found with id: ${id}`);
    }
    
    const sanitized = sanitizeAnnotation({ ...existing.toObject(), ...updateAnnotationDto });
    
    if (!isValidAnnotation(sanitized)) {
      throw new BadRequestException('Invalid annotation data format');
    }
    
    return this.annotationService.update(id, sanitized);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    const result = await this.annotationService.delete(id);
    if (!result) {
      throw new BadRequestException(`Annotation not found with id: ${id}`);
    }
    return { success: true, message: 'Annotation deleted successfully' };
  }
}
