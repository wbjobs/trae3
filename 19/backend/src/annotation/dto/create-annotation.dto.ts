import { IsString, IsNumber, IsEnum, IsOptional, IsMongoId } from 'class-validator';
import { AnnotationType } from '../../../shared/types';

export class CreateAnnotationDto {
  @IsString()
  name: string;

  @IsMongoId()
  @IsOptional()
  pipelineId?: string;

  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  z: number;

  @IsEnum(['valve', 'joint', 'manhole', 'transformer', 'general'])
  @IsOptional()
  type?: AnnotationType;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  author?: string;
}

export class UpdateAnnotationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsMongoId()
  @IsOptional()
  pipelineId?: string;

  @IsNumber()
  @IsOptional()
  x?: number;

  @IsNumber()
  @IsOptional()
  y?: number;

  @IsNumber()
  @IsOptional()
  z?: number;

  @IsEnum(['valve', 'joint', 'manhole', 'transformer', 'general'])
  @IsOptional()
  type?: AnnotationType;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  author?: string;
}
