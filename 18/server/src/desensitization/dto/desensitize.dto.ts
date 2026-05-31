import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export enum DesensitizeMode {
  REPLACE = 'replace',
  MASK = 'mask',
  REMOVE = 'remove',
}

export class CreateDesensitizeDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @IsOptional()
  @IsEnum(DesensitizeMode)
  mode?: DesensitizeMode = DesensitizeMode.MASK;
}
