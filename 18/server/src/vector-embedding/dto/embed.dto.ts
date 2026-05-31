import { IsString, IsOptional, IsNumber, Min, Max, IsArray } from 'class-validator';

export class EmbedDocumentDto {
  @IsString()
  text: string;

  @IsString()
  documentId: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class SearchDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];
}
