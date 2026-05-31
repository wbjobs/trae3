import { Module } from '@nestjs/common';
import { AiQaController } from './ai-qa.controller';
import { AiQaService } from './ai-qa.service';
import { CrossFileService } from './cross-file.service';
import { VectorEmbeddingModule } from '../vector-embedding/vector-embedding.module';

@Module({
  imports: [VectorEmbeddingModule],
  controllers: [AiQaController],
  providers: [AiQaService, CrossFileService],
})
export class AiQaModule {}
