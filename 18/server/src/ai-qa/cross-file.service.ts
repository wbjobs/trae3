import { Injectable } from '@nestjs/common';
import { VectorEmbeddingService } from '../vector-embedding/vector-embedding.service';
import { SourceItem } from './types';
import { ChatOpenAI } from '@langchain/openai';

interface SearchResult {
  id: string;
  documentId?: string;
  chunkText?: string;
  score?: number;
  metadata?: Record<string, any>;
}

interface DocumentGroup {
  documentId: string;
  chunks: SearchResult[];
  keyPoints: string[];
}

@Injectable()
export class CrossFileService {
  private readonly llm: ChatOpenAI;

  constructor(private readonly vectorEmbeddingService: VectorEmbeddingService) {
    const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || '300000', 10);
    this.llm = new ChatOpenAI({
      configuration: {
        baseURL: process.env.LLM_API_BASE,
        apiKey: process.env.LLM_API_KEY || 'ollama',
        defaultHeaders: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
      modelName: process.env.LLM_MODEL_NAME || 'qwen2.5:7b',
      temperature: 0.1,
      timeout: timeoutMs,
      maxRetries: 3,
    });
  }

  async searchAcrossDocuments(
    query: string,
    documentIds: string[],
    topK: number,
  ): Promise<SearchResult[]> {
    return this.vectorEmbeddingService.search(query, topK, 0.5, documentIds);
  }

  groupResultsByDocument(docs: SearchResult[]): DocumentGroup[] {
    const groupMap = new Map<string, SearchResult[]>();

    for (const doc of docs) {
      const docId = doc.documentId || 'unknown';
      if (!groupMap.has(docId)) {
        groupMap.set(docId, []);
      }
      groupMap.get(docId)!.push(doc);
    }

    return Array.from(groupMap.entries()).map(([documentId, chunks]) => ({
      documentId,
      chunks,
      keyPoints: [],
    }));
  }

  async extractKeyPoints(group: DocumentGroup, question: string): Promise<DocumentGroup> {
    const chunksText = group.chunks
      .map((c, i) => `片段${i + 1}: ${c.chunkText || ''}`)
      .join('\n');

    const prompt = `根据以下文档片段，针对问题"${question}"提取关键要点。文档内容：\n${chunksText}\n\n关键要点：`;

    const result = await this.llm.invoke([{ role: 'user', content: prompt }]);
    const keyPointsText = typeof result.content === 'string' ? result.content : '';

    return {
      ...group,
      keyPoints: keyPointsText
        .split('\n')
        .map((line) => line.replace(/^[\d\-•*.]+\s*/, '').trim())
        .filter((line) => line.length > 0),
    };
  }

  async synthesizeCrossDocumentInsights(
    groups: DocumentGroup[],
    question: string,
  ): Promise<string> {
    if (groups.length <= 1) {
      return '';
    }

    const summaries = groups
      .map((g) => `文档${g.documentId}的关键要点：\n${g.keyPoints.map((kp) => `- ${kp}`).join('\n')}`)
      .join('\n\n');

    const prompt = `基于以下多个文档的关键要点，对问题"${question}"进行跨文档综合分析，找出文档间的关联、差异和补充信息。\n\n${summaries}\n\n跨文档综合分析：`;

    const result = await this.llm.invoke([{ role: 'user', content: prompt }]);
    return typeof result.content === 'string' ? result.content : '';
  }

  async performCrossFileReasoning(
    question: string,
    documentIds: string[],
    topK: number,
  ): Promise<{
    sources: SourceItem[];
    crossFileAnalysis: string;
  }> {
    const docs = await this.searchAcrossDocuments(question, documentIds, topK);

    const sources: SourceItem[] = docs.map((doc) => ({
      documentId: doc.documentId || 'unknown',
      chunkText: doc.chunkText || '',
      score: doc.score ?? 0,
      metadata: doc.metadata || {},
      chunkIndex: doc.metadata?.chunkIndex ?? 0,
    }));

    let groups = this.groupResultsByDocument(docs);

    groups = await Promise.all(
      groups.map((group) => this.extractKeyPoints(group, question)),
    );

    const crossFileAnalysis = await this.synthesizeCrossDocumentInsights(groups, question);

    return { sources, crossFileAnalysis };
  }
}
