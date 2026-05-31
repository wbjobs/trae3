import { IsString, IsOptional, IsArray, IsBoolean, IsNumber } from 'class-validator';

export class AskDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  @IsOptional()
  @IsNumber()
  topK?: number = 5;

  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @IsOptional()
  @IsBoolean()
  useCache?: boolean = true;
}
