import { Module } from '@nestjs/common';
import { VectorEmbeddingController } from './vector-embedding.controller';
import { VectorEmbeddingService } from './vector-embedding.service';
import { TextSplitter } from './text-splitter';
import { EmbeddingProvider } from './embedding.provider';
import { FaissStore } from './faiss.store';

@Module({
  controllers: [VectorEmbeddingController],
  providers: [VectorEmbeddingService, TextSplitter, EmbeddingProvider, FaissStore],
  exports: [VectorEmbeddingService],
})
export class VectorEmbeddingModule {}
