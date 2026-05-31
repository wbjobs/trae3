import { Module } from '@nestjs/common';
import { DesensitizationController } from './desensitization.controller';
import { DesensitizationService } from './desensitization.service';
import { StreamingDesensitizeService } from './streaming-desensitize.service';
import { RegexStrategy } from './strategies/regex.strategy';
import { NlpStrategy } from './strategies/nlp.strategy';

@Module({
  controllers: [DesensitizationController],
  providers: [DesensitizationService, StreamingDesensitizeService, RegexStrategy, NlpStrategy],
  exports: [DesensitizationService, StreamingDesensitizeService],
})
export class DesensitizationModule {}
