import { Injectable, Logger } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RetryService } from '../common/retry.service';

@Injectable()
export class EmbeddingProvider {
  private readonly logger = new Logger(EmbeddingProvider.name);
  private embeddings: OpenAIEmbeddings;
  private readonly batchSize: number;
  private readonly maxConcurrency: number;
  private readonly dimension: number;
  private readonly cache: Map<string, number[]> = new Map();
  private readonly CACHE_MAX_SIZE = 10000;

  constructor(private readonly retryService: RetryService) {
    this.batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE, 10) || 8;
    this.maxConcurrency = parseInt(process.env.EMBEDDING_MAX_CONCURRENCY, 10) || 3;
    this.dimension = parseInt(process.env.EMBEDDING_DIMENSION, 10) || 768;

    const timeoutMs = parseInt(process.env.EMBEDDING_TIMEOUT_MS, 10) || 120000;
    const maxRetries = parseInt(process.env.EMBEDDING_MAX_RETRIES, 10) || 3;

    this.embeddings = new OpenAIEmbeddings({
      configuration: {
        baseURL: process.env.EMBEDDING_API_BASE || 'http://localhost:11434/v1',
        apiKey: process.env.EMBEDDING_API_KEY || 'ollama',
        defaultHeaders: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
      model: process.env.EMBEDDING_MODEL_NAME || 'nomic-embed-text',
      batchSize: this.batchSize,
      maxConcurrency: this.maxConcurrency,
      maxRetries: 0,
      timeout: timeoutMs,
    });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const uncachedTexts: { text: string; index: number }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const cached = this.cache.get(text);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedTexts.push({ text, index: i });
      }
    }

    if (uncachedTexts.length > 0) {
      const total = uncachedTexts.length;
      this.logger.log(`Embedding ${total} texts (${results.length} from cache)`);

      for (let i = 0; i < total; i += this.batchSize) {
        const batch = uncachedTexts.slice(i, i + this.batchSize);
        const batchTexts = batch.map((b) => b.text);

        const embeddings = await this.embedWithRetry(batchTexts, true);

        for (let j = 0; j < batch.length; j++) {
          const embedding = embeddings[j] || this.generateFallbackEmbedding();
          results[batch[j].index] = embedding;
          this.addToCache(batch[j].text, embedding);
        }

        if (total > this.batchSize) {
          this.logger.log(`Embedded ${Math.min(i + this.batchSize, total)}/${total}`);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    }

    return results;
  }

  async embedQuery(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    const embedding = await this.embedWithRetry([text], false);
    const result = embedding[0] || this.generateFallbackEmbedding();
    this.addToCache(text, result);
    return result;
  }

  private async embedWithRetry(texts: string[], isBatch: boolean): Promise<number[][]> {
    const operation = async () => {
      if (isBatch) {
        return await this.embeddings.embedDocuments(texts);
      } else {
        const result = await this.embeddings.embedQuery(texts[0]);
        return [result];
      }
    };

    try {
      return await this.retryService.execute(operation, {
        maxRetries: parseInt(process.env.EMBEDDING_MAX_RETRIES, 10) || 3,
        initialDelayMs: parseInt(process.env.RETRY_INITIAL_DELAY_MS, 10) || 1000,
        maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS, 10) || 30000,
      });
    } catch (error) {
      this.logger.error(`Embedding failed after retries: ${error}`);
      return texts.map(() => this.generateFallbackEmbedding());
    }
  }

  private addToCache(text: string, embedding: number[]): void {
    if (this.cache.size >= this.CACHE_MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(text, embedding);
  }

  private generateFallbackEmbedding(): number[] {
    const result = new Array(this.dimension);
    for (let i = 0; i < this.dimension; i++) {
      result[i] = (Math.random() - 0.5) * 0.01;
    }
    return result;
  }

  getStats(): { cacheSize: number; dimension: number; batchSize: number } {
    return {
      cacheSize: this.cache.size,
      dimension: this.dimension,
      batchSize: this.batchSize,
    };
  }
}
