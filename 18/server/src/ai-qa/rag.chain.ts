import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';

const RAG_PROMPT_TEMPLATE = `你是涉密文件智能检索助手。请根据以下检索到的文档内容回答用户问题。
如果无法从提供的文档中找到明确答案，请明确说明"根据现有文档无法找到相关答案"。
回答请使用标准中文 UTF-8 编码，避免乱码。

--- 检索文档 ---
{context}
--- 检索文档结束 ---

用户问题：{question}

请基于以上文档内容，用清晰、准确的中文回答：`;

export interface RAGChainInput {
  question: string;
  context: string;
}

export function createRAGChain(): RunnableSequence<RAGChainInput, string> {
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || '300000', 10);
  const maxRetries = parseInt(process.env.LLM_MAX_RETRIES || '3', 10);

  const llm = new ChatOpenAI({
    configuration: {
      baseURL: process.env.LLM_API_BASE,
      apiKey: process.env.LLM_API_KEY || 'ollama',
      defaultHeaders: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json; charset=utf-8',
      },
    },
    modelName: process.env.LLM_MODEL_NAME || 'qwen2.5:7b',
    temperature: 0.1,
    maxTokens: 4096,
    timeout: timeoutMs,
    maxRetries,
    verbose: process.env.LOG_LEVEL === 'debug',
  });

  const prompt = PromptTemplate.fromTemplate(RAG_PROMPT_TEMPLATE);

  const outputParser = new StringOutputParser();

  const chain = RunnableSequence.from([
    {
      context: (input: RAGChainInput) => sanitizeText(input.context),
      question: (input: RAGChainInput) => sanitizeText(input.question),
    },
    prompt,
    llm,
    outputParser,
    {
      transform: (output: string) => fixEncoding(output),
    },
  ]);

  return chain;
}

function sanitizeText(text: string): string {
  if (!text) return '';
  let result = text;
  result = result.replace(/\x00/g, '');
  result = result.replace(/\uFFFD/g, '');
  result = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  result = Buffer.from(result, 'utf-8').toString('utf-8');
  return result;
}

function fixEncoding(text: string): string {
  if (!text) return '';
  let result = text;
  const fixMap: Record<string, string> = {
    'Ã¥': 'å',
    'Ã¤': 'ä',
    'Ã¶': 'ö',
    'Ã¼': 'ü',
    'Ã…': 'Å',
    'Ã„': 'Ä',
    'Ã–': 'Ö',
    'Ãœ': 'Ü',
    'ÃŸ': 'ß',
    'â€œ': '"',
    'â€': '"',
    'â€˜': "'",
    'â€™': "'",
    'â€”': '—',
    'â€“': '–',
    'â€¦': '...',
    'Â': '',
  };
  for (const [broken, fixed] of Object.entries(fixMap)) {
    result = result.split(broken).join(fixed);
  }
  result = result.replace(/[^\x00-\x7F\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2000-\u206f\u3001-\u301e\u30fb]/g, (char) => {
    if (char.length > 1) return char;
    const code = char.charCodeAt(0);
    if (code < 128 || (code >= 0x4e00 && code <= 0x9fff)) return char;
    if (code >= 0x3400 && code <= 0x4dbf) return char;
    if (code >= 0x20000 && code <= 0x2a6df) return char;
    if (code >= 0x2a700 && code <= 0x2b73f) return char;
    if (code >= 0x2b740 && code <= 0x2b81f) return char;
    if (code >= 0x2b820 && code <= 0x2cea1) return char;
    return '';
  });
  return result;
}

export function formatDocs(docs: Document[]): string {
  return docs
    .map((doc, i) => {
      const docId = doc.metadata?.documentId || 'unknown';
      const chunkIndex = doc.metadata?.chunkIndex ?? i;
      return `[文档${i + 1}] ID:${docId} 块:${chunkIndex}: ${doc.pageContent}`;
    })
    .join('\n\n');
}

export function extractSourceLinks(text: string): string[] {
  const links: string[] = [];
  const regex = /\[文档(\d+)\]\s*ID:([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    links.push(match[2]);
  }
  return links;
}
