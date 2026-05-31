import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ClassificationLevel } from '../entities/file-record.entity';

export class UploadFileDto {
  @IsString()
  department: string;

  @IsEnum(ClassificationLevel)
  classification: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class FileFilterDto {
  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(ClassificationLevel)
  classification?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
