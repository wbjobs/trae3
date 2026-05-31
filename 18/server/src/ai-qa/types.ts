export interface SourceItem {
  documentId: string;
  chunkText: string;
  score: number;
  metadata: Record<string, any>;
  documentName?: string;
  sourceUrl?: string;
  chunkIndex?: number;
}

export interface QAResponse {
  answer: string;
  sources: SourceItem[];
  crossFileAnalysis?: string;
  conversationId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: SourceItem[];
}
