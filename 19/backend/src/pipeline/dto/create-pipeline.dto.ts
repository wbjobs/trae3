import { IsString, IsNumber, IsArray, IsEnum, IsOptional, Min } from 'class-validator';
import { PipelineType } from '../../../shared/types';

export class CreatePipelineDto {
  @IsString()
  name: string;

  @IsEnum(['water', 'sewage', 'electric', 'gas', 'heat'])
  type: PipelineType;

  @IsNumber()
  @Min(0.1)
  diameter: number;

  @IsString()
  @IsOptional()
  material?: string;

  @IsArray()
  points: Array<{ x: number; y: number; z: number }>;

  @IsNumber()
  depth: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdatePipelineDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(['water', 'sewage', 'electric', 'gas', 'heat'])
  @IsOptional()
  type?: PipelineType;

  @IsNumber()
  @Min(0.1)
  @IsOptional()
  diameter?: number;

  @IsString()
  @IsOptional()
  material?: string;

  @IsArray()
  @IsOptional()
  points?: Array<{ x: number; y: number; z: number }>;

  @IsNumber()
  @IsOptional()
  depth?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
