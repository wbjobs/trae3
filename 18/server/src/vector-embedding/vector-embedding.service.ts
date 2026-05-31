import { Injectable, Logger } from '@nestjs/common';
import { TextSplitter, ChunkResult } from './text-splitter';
import { EmbeddingProvider } from './embedding.provider';
import { FaissStore, VectorMetadata, SearchResult } from './faiss.store';
import { HardwareOptimizationService } from '../common/hardware-optimization.service';

@Injectable()
export class VectorEmbeddingService {
  private readonly logger = new Logger(VectorEmbeddingService.name);

  constructor(
    private textSplitter: TextSplitter,
    private embeddingProvider: EmbeddingProvider,
    private faissStore: FaissStore,
    private hardwareService: HardwareOptimizationService,
  ) {}

  async embedDocument(
    text: string,
    documentId: string,
    metadata?: Record<string, any>,
  ): Promise<{ chunkCount: number; documentId: string }> {
    return this.hardwareService.executeWithThrottling(async () => {
      const chunks = this.textSplitter.split(text);
      if (chunks.length === 0) {
        return { chunkCount: 0, documentId };
      }

      const texts = chunks.map((c) => c.text);
      const vectors = await this.embeddingProvider.embedDocuments(texts);

      const metadatas: VectorMetadata[] = chunks.map((chunk, idx) => ({
        documentId,
        chunkIndex: chunk.chunkIndex,
        originalText: chunk.text,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        ...metadata,
      }));

      await this.faissStore.addVectors('classified_docs', vectors, metadatas);

      this.logger.log(`Embedded ${chunks.length} chunks for document ${documentId}`);

      return {
        chunkCount: chunks.length,
        documentId,
      };
    });
  }

  async embedDocumentsBatch(
    documents: Array<{ text: string; documentId: string; metadata?: Record<string, any> }>,
  ): Promise<Array<{ chunkCount: number; documentId: string }>> {
    const results: Array<{ chunkCount: number; documentId: string }> = [];
    for (const doc of documents) {
      const result = await this.embedDocument(doc.text, doc.documentId, doc.metadata);
      results.push(result);
    }
    return results;
  }

  async search(
    query: string,
    topK = 5,
    threshold = 0.5,
    documentIds?: string[],
  ): Promise<SearchResult[]> {
    return this.hardwareService.executeWithThrottling(async () => {
      const queryVector = await this.embeddingProvider.embedQuery(query);
      return this.faissStore.search(
        'classified_docs',
        queryVector,
        topK,
        threshold,
        documentIds,
      );
    });
  }

  async batchSearch(
    queries: string[],
    topK = 5,
    threshold = 0.5,
  ): Promise<SearchResult[][]> {
    const queryVectors = await this.embeddingProvider.embedDocuments(queries);
    return this.faissStore.batchSearch('classified_docs', queryVectors, topK, threshold);
  }

  deleteIndex(documentId: string): boolean {
    return this.faissStore.deleteByDocumentId('classified_docs', documentId);
  }

  getStats() {
    return {
      faiss: this.faissStore.getStats(),
      embedding: this.embeddingProvider.getStats(),
    };
  }

  optimizeIndex(): void {
    this.faissStore.optimizeAll();
  }

  getDocumentIds(): string[] {
    return this.faissStore.getDocumentIds('classified_docs');
  }
}
