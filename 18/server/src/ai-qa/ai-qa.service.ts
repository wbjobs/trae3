import { Injectable, Logger } from '@nestjs/common';
import { VectorEmbeddingService } from '../vector-embedding/vector-embedding.service';
import { CrossFileService } from './cross-file.service';
import { AskDto } from './dto/qa.dto';
import { Conversation, ConversationMessage, QAResponse, SourceItem } from './types';
import { createOptimizedRAGChain, fixEncoding, formatDocsCompact } from './optimized-rag.chain';
import { v4 as uuidv4 } from 'uuid';
import { Observable } from 'rxjs';
import * as crypto from 'crypto';

export interface EnhancedSourceItem extends SourceItem {
  documentName?: string;
  sourceUrl?: string;
  chunkIndex?: number;
}

interface PerformanceStats {
  totalRequests: number;
  totalTokensSaved: number;
  avgResponseTimeMs: number;
  cacheHits: number;
}

interface CacheEntry {
  answer: string;
  sources: EnhancedSourceItem[];
  crossFileAnalysis?: string;
  timestamp: number;
}

@Injectable()
export class AiQaService {
  private readonly logger = new Logger(AiQaService.name);
  private readonly conversations = new Map<string, Conversation>();
  private readonly ragChain = createOptimizedRAGChain();
  private readonly streamingRagChain = createOptimizedRAGChain({ streaming: true });
  private readonly documentNames = new Map<string, string>();
  private readonly responseCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly CACHE_MAX_SIZE = 200;
  private readonly MAX_CONTEXT_DOCS = 3;
  private stats: PerformanceStats = {
    totalRequests: 0,
    totalTokensSaved: 0,
    avgResponseTimeMs: 0,
    cacheHits: 0,
  };

  constructor(
    private readonly vectorEmbeddingService: VectorEmbeddingService,
    private readonly crossFileService: CrossFileService,
  ) {}

  async ask(dto: AskDto): Promise<QAResponse> {
    const { question, conversationId, documentIds, topK = 5, useCache = true } = dto;
    const startTime = Date.now();

    this.stats.totalRequests++;
    this.logger.log(`Processing question: ${question.substring(0, 50)}...`);

    const cacheKey = this.buildCacheKey(question, documentIds);
    if (useCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        this.logger.log('Cache hit for question');
        return {
          answer: cached.answer,
          sources: cached.sources,
          crossFileAnalysis: cached.crossFileAnalysis,
          conversationId,
        };
      }
    }

    const effectiveTopK = Math.min(topK, this.MAX_CONTEXT_DOCS);

    let sources: EnhancedSourceItem[] = [];
    let crossFileAnalysis: string | undefined;
    let answer: string;

    try {
      if (documentIds && documentIds.length > 0) {
        const crossFileResult = await this.crossFileService.performCrossFileReasoning(
          question,
          documentIds,
          effectiveTopK,
        );
        sources = crossFileResult.sources.map((s) => this.enhanceSource(s));
        crossFileAnalysis = crossFileResult.crossFileAnalysis || undefined;
      } else {
        const docs = await this.vectorEmbeddingService.search(
          question,
          effectiveTopK,
          0.5,
        );
        sources = docs.map((doc) => this.enhanceSource({
          documentId: doc.documentId || 'unknown',
          chunkText: doc.chunkText || '',
          score: doc.score ?? 0,
          metadata: doc.metadata || {},
          chunkIndex: doc.metadata?.chunkIndex ?? 0,
        }));
      }

      const contextText = formatDocsCompact(
        sources.map((s) => ({
          pageContent: s.chunkText,
          metadata: { documentId: s.documentId },
        })),
        this.MAX_CONTEXT_DOCS,
      );

      const originalTokenEstimate = contextText.length / 2;
      answer = await this.ragChain.invoke({
        question,
        context: contextText,
      });
      const optimizedTokenEstimate = contextText.length / 2;
      this.stats.totalTokensSaved += Math.max(0, originalTokenEstimate - optimizedTokenEstimate);

      answer = fixEncoding(answer);
      answer = this.injectSourceCitations(answer, sources);

      if (useCache) {
        this.addToCache(cacheKey, {
          answer,
          sources,
          crossFileAnalysis,
          timestamp: Date.now(),
        });
      }

      const newConvId = this.saveToConversation(conversationId, question, answer, sources);

      const responseTime = Date.now() - startTime;
      this.updateAvgResponseTime(responseTime);

      this.logger.log(`Question answered in ${responseTime}ms, tokens saved: ~${Math.round(this.stats.totalTokensSaved)}`);

      return {
        answer,
        sources,
        crossFileAnalysis,
        conversationId: newConvId,
      };
    } catch (error: any) {
      this.logger.error(`QA failed: ${error.message}`, error.stack);
      throw new Error(`问答处理失败: ${error.message}`);
    }
  }

  askStream(dto: AskDto): Observable<{ type: string; content: string; sources?: SourceItem[] }> {
    const { question, conversationId, documentIds, topK = 5 } = dto;

    return new Observable<{ type: string; content: string; sources?: SourceItem[] }>((subscriber) => {
      (async () => {
        try {
          const effectiveTopK = Math.min(topK, this.MAX_CONTEXT_DOCS);
          let sources: EnhancedSourceItem[] = [];

          if (documentIds && documentIds.length > 0) {
            const crossFileResult = await this.crossFileService.performCrossFileReasoning(
              question,
              documentIds,
              effectiveTopK,
            );
            sources = crossFileResult.sources.map((s) => this.enhanceSource(s));
          } else {
            const docs = await this.vectorEmbeddingService.search(
              question,
              effectiveTopK,
              0.5,
            );
            sources = docs.map((doc) =>
              this.enhanceSource({
                documentId: doc.documentId || 'unknown',
                chunkText: doc.chunkText || '',
                score: doc.score ?? 0,
                metadata: doc.metadata || {},
                chunkIndex: doc.metadata?.chunkIndex ?? 0,
              }),
            );
          }

          subscriber.next({ type: 'sources', content: '', sources });

          const contextText = formatDocsCompact(
            sources.map((s) => ({
              pageContent: s.chunkText,
              metadata: { documentId: s.documentId },
            })),
            this.MAX_CONTEXT_DOCS,
          );

          const stream = await this.streamingRagChain.stream({
            question,
            context: contextText,
          });

          let fullAnswer = '';

          for await (const chunk of stream) {
            const cleanChunk = fixEncoding(chunk);
            fullAnswer += cleanChunk;
            subscriber.next({ type: 'content', content: cleanChunk });
          }

          this.saveToConversation(conversationId, question, fullAnswer, sources);

          subscriber.next({ type: 'done', content: '' });
          subscriber.complete();
        } catch (error) {
          this.logger.error(`Stream QA failed: ${error}`);
          subscriber.error(error);
        }
      })();
    });
  }

  private buildCacheKey(question: string, documentIds?: string[]): string {
    const normalizedQuestion = question.trim().toLowerCase();
    const idsPart = documentIds ? documentIds.sort().join(',') : 'all';
    return crypto.createHash('md5').update(`${normalizedQuestion}:${idsPart}`).digest('hex');
  }

  private getFromCache(key: string): CacheEntry | null {
    const entry = this.responseCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.responseCache.delete(key);
      return null;
    }
    return entry;
  }

  private addToCache(key: string, entry: CacheEntry): void {
    if (this.responseCache.size >= this.CACHE_MAX_SIZE) {
      const firstKey = this.responseCache.keys().next().value;
      if (firstKey !== undefined) {
        this.responseCache.delete(firstKey);
      }
    }
    this.responseCache.set(key, entry);
  }

  private updateAvgResponseTime(newTime: number): void {
    const total = this.stats.totalRequests;
    this.stats.avgResponseTimeMs = (this.stats.avgResponseTimeMs * (total - 1) + newTime) / total;
  }

  private buildContext(sources: EnhancedSourceItem[]): string {
    return formatDocsCompact(
      sources.map((s) => ({
        pageContent: s.chunkText,
        metadata: { documentId: s.documentId },
      })),
      this.MAX_CONTEXT_DOCS,
    );
  }

  private enhanceSource(source: SourceItem): EnhancedSourceItem {
    const docId = source.documentId || 'unknown';
    const enhanced: EnhancedSourceItem = {
      ...source,
      chunkIndex: source.metadata?.chunkIndex ?? 0,
    };

    if (this.documentNames.has(docId)) {
      enhanced.documentName = this.documentNames.get(docId);
    }

    enhanced.sourceUrl = this.buildSourceUrl(docId, enhanced.chunkIndex);

    return enhanced;
  }

  private buildSourceUrl(documentId: string, chunkIndex?: number): string {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    let url = `${baseUrl}/desensitize/${documentId}`;
    if (chunkIndex !== undefined) {
      url += `#chunk-${chunkIndex}`;
    }
    return url;
  }

  private injectSourceCitations(answer: string, sources: EnhancedSourceItem[]): string {
    const docIdToIndex = new Map<string, number>();
    sources.forEach((s, i) => {
      if (!docIdToIndex.has(s.documentId)) {
        docIdToIndex.set(s.documentId, i + 1);
      }
    });

    let citedAnswer = answer;
    for (const [docId, index] of docIdToIndex.entries()) {
      const source = sources.find((s) => s.documentId === docId);
      if (source) {
        const linkMarkdown = `[[${index}](${source.sourceUrl})]`;
        citedAnswer = citedAnswer.replace(
          new RegExp(`\\[文档.*?${docId}.*?\\]`, 'g'),
          linkMarkdown,
        );
      }
    }

    return citedAnswer;
  }

  setDocumentName(documentId: string, name: string): void {
    this.documentNames.set(documentId, name);
  }

  private saveToConversation(
    conversationId: string | undefined,
    question: string,
    answer: string,
    sources?: SourceItem[],
  ): string {
    const now = new Date();
    const userMessage: ConversationMessage = {
      role: 'user',
      content: question,
      timestamp: now,
    };
    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: answer,
      timestamp: new Date(),
      sources,
    };

    if (conversationId && this.conversations.has(conversationId)) {
      const conversation = this.conversations.get(conversationId)!;
      conversation.messages.push(userMessage, assistantMessage);
      return conversationId;
    }

    const newId = conversationId || uuidv4();
    const conversation: Conversation = {
      id: newId,
      title: question.slice(0, 50) + (question.length > 50 ? '...' : ''),
      createdAt: now,
      messages: [userMessage, assistantMessage],
    };
    this.conversations.set(newId, conversation);
    return newId;
  }

  getConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  deleteConversation(id: string): boolean {
    return this.conversations.delete(id);
  }

  getPerformanceStats(): PerformanceStats & { cacheSize: number; hitRate: string } {
    const hitRate = this.stats.totalRequests > 0
      ? ((this.stats.cacheHits / this.stats.totalRequests) * 100).toFixed(1) + '%'
      : '0%';
    return {
      ...this.stats,
      cacheSize: this.responseCache.size,
      hitRate,
    };
  }

  clearCache(): void {
    this.responseCache.clear();
    this.logger.log('QA cache cleared');
  }
}
