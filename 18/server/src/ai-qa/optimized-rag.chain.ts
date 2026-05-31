import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';
import { Logger } from '@nestjs/common';

const logger = new Logger('OptimizedRAGChain');

const COMPACT_RAG_PROMPT = `基于以下文档回答问题。
如无答案请回复"无相关信息"。
回答仅限中文，简洁准确。

文档:
{context}

问题: {question}

回答:`;

const CONDENSE_QUESTION_PROMPT = `结合对话历史生成独立问题: {question}

历史:
{chat_history}

新问题:`;

export interface RAGChainInput {
  question: string;
  context: string;
  chatHistory?: string;
  maxTokens?: number;
}

export interface BatchRAGOptions {
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  useCondensedQuestion?: boolean;
  useStreaming?: boolean;
}

export function createOptimizedRAGChain(options: BatchRAGOptions = {}) {
  const {
    temperature = 0.1,
    maxTokens = 2048,
    streaming = false,
  } = options;

  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || '300000', 10);
  const maxRetries = parseInt(process.env.LLM_MAX_RETRIES || '3', 10);

  const llm = new ChatOpenAI({
    configuration: {
      baseURL: process.env.LLM_API_BASE,
      apiKey: process.env.LLM_API_KEY || 'ollama',
      defaultHeaders: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
    modelName: process.env.LLM_MODEL_NAME || 'qwen2.5:7b',
    temperature,
    maxTokens,
    timeout: timeoutMs,
    maxRetries,
    streaming,
    verbose: process.env.LOG_LEVEL === 'debug',
  });

  const prompt = PromptTemplate.fromTemplate(COMPACT_RAG_PROMPT);
  const outputParser = new StringOutputParser();

  return RunnableSequence.from([
    {
      context: (input: RAGChainInput) => optimizeContext(input.context),
      question: (input: RAGChainInput) => sanitizeText(input.question),
    },
    prompt,
    llm,
    outputParser,
    new RunnableLambda({
      func: (output: string) => fixEncoding(output),
    }),
  ]);
}

export function createBatchRAGChain(options: BatchRAGOptions = {}) {
  return createOptimizedRAGChain(options);
}

export function createCondensedQuestionChain() {
  const prompt = PromptTemplate.fromTemplate(CONDENSE_QUESTION_PROMPT);
  const llm = createBaseLLM({ maxTokens: 512, temperature: 0.0 });
  return RunnableSequence.from([prompt, llm, new StringOutputParser()]);
}

function createBaseLLM(options: { maxTokens?: number; temperature?: number; streaming?: boolean } = {}) {
  const { maxTokens = 2048, temperature = 0.1, streaming = false } = options;
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || '300000', 10);
  return new ChatOpenAI({
    configuration: {
      baseURL: process.env.LLM_API_BASE,
      apiKey: process.env.LLM_API_KEY || 'ollama',
    },
    modelName: process.env.LLM_MODEL_NAME || 'qwen2.5:7b',
    temperature,
    maxTokens,
    timeout: timeoutMs,
    streaming,
  });
}

function sanitizeText(text: string): string {
  if (!text) return '';
  let result = text;
  result = result.replace(/\x00/g, '');
  result = result.replace(/\uFFFD/g, '');
  result = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  return Buffer.from(result, 'utf-8').toString('utf-8');
}

function optimizeContext(context: string): string {
  if (!context) return '';
  const maxContextLength = parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '6000', 10);

  let optimized = context.replace(/\s+/g, ' ').trim();

  if (optimized.length > maxContextLength * 2) {
    logger.log(`Context truncated from ${optimized.length} to ${maxContextLength * 2} chars`);
    optimized = optimized.slice(0, maxContextLength * 2);
  }

  return optimized;
}

function fixEncoding(text: string): string {
  if (!text) return '';
  let result = text;
  const fixMap: Record<string, string> = {
    'Ã¥': 'å', 'Ã¤': 'ä', 'Ã¶': 'ö', 'Ã¼': 'ü',
    'â€œ': '"', 'â€': '"', 'â€˜': "'", 'â€™': "'",
    'â€”': '—', 'â€“': '–', 'â€¦': '...', 'Â': '',
  };
  for (const [broken, fixed] of Object.entries(fixMap)) {
    result = result.split(broken).join(fixed);
  }
  return result.trim();
}

export function formatDocsCompact(docs: Document[], maxDocs = 3): string {
  const selectedDocs = docs.slice(0, maxDocs);
  return selectedDocs
    .map((doc, i) => {
      const docId = doc.metadata?.documentId?.slice(0, 8) || '';
      return `[${i + 1}] ${docId}: ${doc.pageContent}`;
    })
    .join('\n');
}

export function condenseChatHistory(messages: Array<{ role: string; content: string }>, maxHistory = 6): string {
  const recent = messages.slice(-maxHistory);
  return recent
    .filter((m) => `${m.role}: ${m.content}`)
    .join('\n');
}

export async function batchProcessBatch(questions: string[], docs: Document[][], options: BatchRAGOptions = {}): Promise<string[]> {
  const results: string[] = [];
  const batchSize = parseInt(process.env.LLM_BATCH_SIZE || '3', 10);

  for (let i = 0; i < questions.length; i += batchSize) {
    const batchQuestions = questions.slice(i, i + batchSize);
    const batchDocs = docs.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batchQuestions.map((q, idx) => {
        const chain = createOptimizedRAGChain(options);
        return chain.invoke({
          question: q,
          context: formatDocsCompact(batchDocs[idx] || []),
        });
      }),
    );

    results.push(...batchResults);

    if (questions.length > batchSize) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}
